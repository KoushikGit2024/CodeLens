'use strict';

const crypto = require('crypto');

/**
 * fingerprint.js
 *
 * Provides deterministic hashing for file contents to support incremental analysis.
 */

/**
 * Generate a SHA-256 hash for the given file contents.
 *
 * @param {string|Buffer} content
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = {
  hashContent,
};
