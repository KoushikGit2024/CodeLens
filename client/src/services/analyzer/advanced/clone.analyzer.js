'use strict';

/**
 * clone.analyzer.js
 *
 * Detects structural code clones (copy-pasted code) across files.
 * It ignores variable names, literals, and comments, focusing only on the
 * structural AST nodes to find exact logical duplicates.
 */

const cyrb53 = function(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1>>>0)).toString(16);
};

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

  return cyrb53(structureStr);
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

export { generateStructuralHash, detectClones };
