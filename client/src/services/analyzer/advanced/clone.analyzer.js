/**
 * clone.analyzer.js
 *
 * It scans the repository ASTs, then extracts structural fingerprints,
 * and then it applies hash grouping to identify exact logical code clones.
 */

import { createAnalysisFinding } from '../parsing/symbols.js';

const cyrb53 = function (str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

const IGNORED_NODES = new Set([
  'identifier',
  'property_identifier',
  'string',
  'number',
  'comment',
  'regex',
  'template_string',
  'string_literal',
  'number_literal',
]);

/**
 * It traverses the syntax tree, then extracts node types while skipping literals,
 * and then it applies a hashing algorithm to return a structural fingerprint.
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

  const elements = structureStr.split(':').length - 1;
  if (elements < 5) return null;

  return cyrb53(structureStr);
}

/**
 * It maps all repository functions, then extracts identically hashed groups,
 * and then it applies the findings schema to return code clone alerts.
 */
function detectClones(allFunctions, filePath) {
  const hashMap = new Map();

  for (const fn of allFunctions) {
    if (!fn.hash) continue;

    if (!hashMap.has(fn.hash)) {
      hashMap.set(fn.hash, []);
    }
    hashMap.get(fn.hash).push(fn);
  }

  const clones = [];
  const findings = [];

  for (const [hash, group] of hashMap.entries()) {
    if (group.length > 1) {
      clones.push({
        hash,
        count: group.length,
        instances: group,
      });

      // It builds the instance array, then extracts the specific line locations, and then it applies the frontend AnalysisFinding schema.
      for (const instance of group) {
        findings.push(
          createAnalysisFinding({
            id: `CLONE-${hash}-${instance.name}-${instance.location.startLine}`,
            analyzerId: 'clone',
            ruleId: 'STRUCTURAL_DUPLICATION',
            category: 'maintainability',
            severity: 'warning',
            title: `Code Clone Detected: ${instance.name}`,
            message: `This structure is duplicated ${group.length} times across the codebase. Consider extracting it into a shared utility.`,
            filePath: instance.filePath || filePath,
            range: {
              startLine: instance.location.startLine,
              startColumn: instance.location.startColumn,
              endLine: instance.location.endLine,
              endColumn: instance.location.endColumn,
            },
          })
        );
      }
    }
  }

  clones.sort((a, b) => b.count - a.count);

  return { cloneGroups: clones, findings };
}

export { generateStructuralHash, detectClones };
