/**
 * parserRegistry.js
 *
 * Manages the lifecycle of web-tree-sitter and all language grammars.
 *
 * Responsibility:
 *   - Initialise web-tree-sitter exactly once (lazy, on first use).
 *   - Load language WASM grammars on demand and cache them.
 *   - Expose a getParser(languageId) function that returns a ready-to-use
 *     tree-sitter Parser pre-configured for the requested language.
 *
 * Why a registry?
 *   web-tree-sitter initialisation is async and must happen before any
 *   parsing.  The WASM binary itself and each grammar are expensive to load.
 *   Caching both avoids repeating the work for every file.
 *
 * Thread safety:
 *   Node.js is single-threaded, so there is no concurrent access issue.
 *   The initialisation Promise is stored so that concurrent callers awaiting
 *   the first call all resolve on the same Promise rather than triggering
 *   multiple inits.
 *
 * Adding a new language:
 *   1. Confirm the grammar WASM exists in tree-sitter-wasms/out/.
 *   2. Add an entry to LANGUAGE_WASM_MAP below.
 *   3. Add the file extension in languageDetector.js.
 *   That is all — no other files need changing.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── WASM path resolution ──────────────────────────────────────────────────────
// web-tree-sitter@0.24.7 is installed in server/node_modules/.
// tree-sitter-wasms@0.1.13 is hoisted to the workspace root node_modules/.
const SERVER_NM   = path.join(__dirname, '..', '..', 'node_modules');
const WORKSPACE_NM = path.join(__dirname, '..', '..', '..', 'node_modules');

// Resolve the directory that actually contains the tree-sitter-wasms package
const WASMS_OUT = (() => {
  const local = path.join(SERVER_NM, 'tree-sitter-wasms', 'out');
  const root  = path.join(WORKSPACE_NM, 'tree-sitter-wasms', 'out');
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(root))  return root;
  throw new Error('[parserRegistry] Cannot locate tree-sitter-wasms package. Run npm install.');
})();

const TS_WASM_FILE = (() => {
  const local = path.join(SERVER_NM, 'web-tree-sitter', 'tree-sitter.wasm');
  const root  = path.join(WORKSPACE_NM, 'web-tree-sitter', 'tree-sitter.wasm');
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(root))  return root;
  throw new Error('[parserRegistry] Cannot locate web-tree-sitter WASM. Run npm install.');
})();

// ── Language → WASM file map ──────────────────────────────────────────────────
// To add a language: add one entry here + extension in languageDetector.js.
const LANGUAGE_WASM_MAP = {
  javascript: path.join(WASMS_OUT, 'tree-sitter-javascript.wasm'),
  typescript: path.join(WASMS_OUT, 'tree-sitter-typescript.wasm'),
  python:     path.join(WASMS_OUT, 'tree-sitter-python.wasm'),
  java:       path.join(WASMS_OUT, 'tree-sitter-java.wasm'),
  cpp:        path.join(WASMS_OUT, 'tree-sitter-cpp.wasm'),
};

// ── State ─────────────────────────────────────────────────────────────────────
let initPromise = null;
let TreeSitterParser = null;
const languageCache = new Map(); // languageId → Language object

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Initialise web-tree-sitter exactly once.
 * Subsequent calls return the cached Promise.
 *
 * @returns {Promise<void>}
 */
async function ensureInitialised() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    TreeSitterParser = require('web-tree-sitter');
    await TreeSitterParser.init({ locateFile: () => TS_WASM_FILE });
  })();

  return initPromise;
}

/**
 * Load and cache a language grammar WASM.
 *
 * @param {string} languageId
 * @returns {Promise<object>} tree-sitter Language object
 */
async function loadLanguage(languageId) {
  if (languageCache.has(languageId)) {
    return languageCache.get(languageId);
  }

  const wasmPath = LANGUAGE_WASM_MAP[languageId];
  if (!wasmPath) {
    throw new Error(`[parserRegistry] No WASM registered for language: ${languageId}`);
  }
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`[parserRegistry] WASM file not found: ${wasmPath}`);
  }

  const lang = await TreeSitterParser.Language.load(wasmPath);
  languageCache.set(languageId, lang);
  return lang;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a tree-sitter Parser configured for the given language.
 *
 * The Parser object is NOT cached — callers must not share parsers across
 * concurrent async operations.  However, the underlying Language object IS
 * cached, so repeated calls for the same language are cheap.
 *
 * @param {string} languageId   e.g. 'javascript', 'typescript'
 * @returns {Promise<object>}   A configured tree-sitter Parser instance
 * @throws {Error}              If the language is not supported or the WASM is missing
 */
async function getParser(languageId) {
  await ensureInitialised();
  const lang = await loadLanguage(languageId);
  const parser = new TreeSitterParser();
  parser.setLanguage(lang);
  return parser;
}

/**
 * Returns whether a given language ID is supported by this registry.
 *
 * @param {string} languageId
 * @returns {boolean}
 */
function isSupported(languageId) {
  return languageId in LANGUAGE_WASM_MAP;
}

/**
 * Returns all registered language IDs.
 *
 * @returns {string[]}
 */
function supportedLanguages() {
  return Object.keys(LANGUAGE_WASM_MAP);
}

module.exports = { getParser, isSupported, supportedLanguages };
