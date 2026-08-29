/**
 * languageDetector.js
 *
 * Maps file extensions to a canonical language identifier.
 *
 * Responsibility:
 *   Given a filename or file extension, return the language string that the
 *   parser registry uses to look up the appropriate parser.  Returns null for
 *   files that are not supported (unsupported languages are skipped during
 *   repository analysis, not treated as errors).
 *
 * Design note:
 *   This module is intentionally minimal — it is a pure data lookup with no
 *   side-effects.  Adding support for a new language means adding its
 *   extension(s) to EXTENSION_MAP and implementing the corresponding parser.
 */

'use strict';

/**
 * Maps file extensions (lowercase, including the leading dot) to language IDs.
 * Language IDs are lowercase strings that match the keys used in the parser
 * registry (see parserRegistry.js).
 *
 * @type {Map<string, string>}
 */
const EXTENSION_MAP = new Map([
  // JavaScript
  ['.js',   'javascript'],
  ['.mjs',  'javascript'],
  ['.cjs',  'javascript'],
  ['.jsx',  'javascript'],  // JSX is parsed with the JS grammar

  // TypeScript
  ['.ts',   'typescript'],
  ['.tsx',  'typescript'],  // TSX is parsed with the TS grammar
  ['.mts',  'typescript'],
  ['.cts',  'typescript'],

  // Future languages (not yet supported — here for documentation)
  // ['.py',  'python'],
  // ['.java','java'],
  // ['.cpp', 'cpp'],
  // ['.c',   'c'],
]);

/**
 * Returns the language ID for a given filename, or null if not supported.
 *
 * @param {string} filename  — file name or path (only the extension is used)
 * @returns {string|null}    — e.g. 'javascript', 'typescript', or null
 *
 * @example
 *   detectLanguage('src/app.ts')   // => 'typescript'
 *   detectLanguage('index.js')     // => 'javascript'
 *   detectLanguage('README.md')    // => null
 */
function detectLanguage(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP.get(ext) ?? null;
}

/**
 * Returns the set of all supported file extensions (e.g. '.js', '.ts').
 * Useful for quickly filtering a file list before attempting to detect language.
 *
 * @returns {Set<string>}
 */
function supportedExtensions() {
  return new Set(EXTENSION_MAP.keys());
}

module.exports = { detectLanguage, supportedExtensions, EXTENSION_MAP };
