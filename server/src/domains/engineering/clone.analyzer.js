'use strict';

/**
 * clone.analyzer.js
 *
 * Detects structural code clones (copy-pasted code) across files.
 * It ignores variable names, literals, and comments, focusing only on the
 * structural AST nodes to find exact logical duplicates.
 */

const crypto = require('crypto');

// Nodes we typically ignore when building a structural string
const IGNORED_NODES = new Set([
  'identifier',
  'property_identifier',
  'string',
  'number',
  'comment',
  'regex',
  'template_string'
]);

/**
 * Generates a structural hash for a given tree-sitter AST node.
 * 
 * @param {object} node 
 * @returns {string} SHA-256 hash
 */
function generateStructuralHash(node) {
  let structureStr = '';

  function walk(n) {
    if (!IGNORED_NODES.has(n.type)) {
      structureStr += n.type + ':';
    }
    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i));
    }
  }

  walk(node);

  // If the function is too small (e.g. fewer than 5 structural elements), ignore it to avoid false positive clones
  const elements = structureStr.split(':').length - 1;
  if (elements < 5) return null;

  return crypto.createHash('sha256').update(structureStr).digest('hex');
}

/**
 * Groups a flat list of functions by their structural hash to find clones.
 * 
 * @param {object[]} allFunctions - Flat array of Function/Method/Arrow symbols from all files
 * @returns {object[]} Array of clone groups
 */
function detectClones(allFunctions) {
  const hashMap = new Map();

  for (const fn of allFunctions) {
    if (!fn.hash) continue; // skip if no hash or too small

    if (!hashMap.has(fn.hash)) {
      hashMap.set(fn.hash, []);
    }
    hashMap.get(fn.hash).push(fn);
  }

  const clones = [];
  for (const [hash, group] of hashMap.entries()) {
    // Only flag as clone if it appears in more than 1 place
    if (group.length > 1) {
      clones.push({
        hash,
        count: group.length,
        instances: group
      });
    }
  }

  // Sort by count descending
  clones.sort((a, b) => b.count - a.count);

  return clones;
}

module.exports = {
  generateStructuralHash,
  detectClones
};
