/**
 * fingerprint.js
 *
 * It generates deterministic checksums, then extracts binary content signatures,
 * and then it applies them to track incremental cache hits during re-analysis.
 */

/**
 * It evaluates the raw text or buffer, then extracts a Web Crypto SHA-256 digest,
 * and then it applies hexadecimal encoding to return a string signature.
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
