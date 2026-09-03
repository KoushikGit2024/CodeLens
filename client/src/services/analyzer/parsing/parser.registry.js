/**
 * parser.registry.js (Frontend Version)
 *
 * Manages the lifecycle of web-tree-sitter and all language grammars in the browser.
 * Loads WASM files over the network from the /parsers/ public directory.
 */

import Parser from 'web-tree-sitter';

// Map of supported languages to their WASM filenames
const LANGUAGE_WASM_MAP = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx:        'tree-sitter-tsx.wasm',
  python:     'tree-sitter-python.wasm',
  java:       'tree-sitter-java.wasm',
  cpp:        'tree-sitter-cpp.wasm',
  kotlin:     'tree-sitter-kotlin.wasm',
};

// ── State ─────────────────────────────────────────────────────────────────────
let initPromise = null;
const languageCache = new Map(); // languageId → Language object

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Initialise web-tree-sitter exactly once in the browser.
 */
async function ensureInitialised() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await Parser.init({
      locateFile(scriptName) {
        // web-tree-sitter asks for 'tree-sitter.wasm'
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
          return 'public/parsers/' + scriptName;
        }
        return '/parsers/' + scriptName;
      },
    });
  })();

  return initPromise;
}

/**
 * Load and cache a language grammar WASM from the public folder.
 *
 * @param {string} languageId
 * @returns {Promise<object>} tree-sitter Language object
 */
async function loadLanguage(languageId) {
  if (languageCache.has(languageId)) {
    return languageCache.get(languageId);
  }

  const wasmFile = LANGUAGE_WASM_MAP[languageId];
  if (!wasmFile) {
    throw new Error(`[parserRegistry] No WASM registered for language: ${languageId}`);
  }

  // Load the WASM binary over HTTP from our public/parsers folder
  let wasmUrl = `/parsers/${wasmFile}`;
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    wasmUrl = `public/parsers/${wasmFile}`;
  }
  const lang = await Parser.Language.load(wasmUrl);
  
  languageCache.set(languageId, lang);
  return lang;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a tree-sitter Parser configured for the given language.
 *
 * @param {string} languageId   e.g. 'javascript', 'typescript'
 * @returns {Promise<object>}   A configured tree-sitter Parser instance
 */
export async function getParser(languageId) {
  await ensureInitialised();
  const lang = await loadLanguage(languageId);
  
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}

/**
 * Returns whether a given language ID is supported by this registry.
 *
 * @param {string} languageId
 * @returns {boolean}
 */
export function isSupported(languageId) {
  return languageId in LANGUAGE_WASM_MAP;
}

/**
 * Returns all registered language IDs.
 *
 * @returns {string[]}
 */
export function supportedLanguages() {
  return Object.keys(LANGUAGE_WASM_MAP);
}
