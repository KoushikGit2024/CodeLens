/**
 * fingerprint.js
 *
 * Provides deterministic hashing for file contents to support incremental analysis.
 * Uses Web Crypto API for browser compatibility.
 */

/**
 * Generate a SHA-256 hash for the given file contents.
 *
 * @param {string|ArrayBuffer} content
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function hashContent(content) {
  let buffer;
  if (typeof content === 'string') {
    buffer = new TextEncoder().encode(content);
  } else {
    buffer = content;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
