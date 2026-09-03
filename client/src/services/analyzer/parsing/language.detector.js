/**
 * language.detector.js (Frontend Version)
 *
 * Maps file extensions to a canonical language identifier.
 */

/**
 * Maps file extensions (lowercase, including the leading dot) to language IDs.
 * Language IDs are lowercase strings that match the keys used in the parser registry.
 *
 * @type {Map<string, string>}
 */
export const EXTENSION_MAP = new Map([
  // JavaScript
  ['.js',   'javascript'],
  ['.mjs',  'javascript'],
  ['.cjs',  'javascript'],
  ['.jsx',  'javascript'],

  // TypeScript
  ['.ts',   'typescript'],
  ['.tsx',  'tsx'],
  ['.mts',  'typescript'],
  ['.cts',  'typescript'],

  // Python
  ['.py',   'python'],

  // Java
  ['.java', 'java'],

  // C++
  ['.cpp',  'cpp'],
  ['.cc',   'cpp'],
  ['.cxx',  'cpp'],
  ['.h',    'cpp'],
  ['.hpp',  'cpp'],

  // Kotlin
  ['.kt',   'kotlin'],
  ['.kts',  'kotlin'],
]);

/**
 * Returns the language ID for a given filename, or null if not supported.
 *
 * @param {string} filename  — file name or path (only the extension is used)
 * @returns {string|null}    — e.g. 'javascript', 'typescript', or null
 */
export function detectLanguage(filename) {
  if (!filename) return null;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return null;
  
  const ext = filename.slice(lastDot).toLowerCase();
  return EXTENSION_MAP.get(ext) ?? null;
}

/**
 * Returns the set of all supported file extensions (e.g. '.js', '.ts').
 *
 * @returns {Set<string>}
 */
export function supportedExtensions() {
  return new Set(EXTENSION_MAP.keys());
}
