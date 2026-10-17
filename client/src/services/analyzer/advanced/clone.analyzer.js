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

const ABSOLUTE_MIN_LINES = 5; // Never flag functions with <= 4 lines as clones
const MIN_STRUCTURAL_ELEMENTS = 16; // Trivial 3-4 line wrappers lack this structural mass
const ABSOLUTE_MIN_SAVINGS = 10; // Minimum duplicated lines saved across the group
const MIN_SAMPLE_SIZE = 6;

/**
 * Computes quantile using linear interpolation on sorted numeric array.
 */
function quantile(arr, q) {
  const pos = q * (arr.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
}

/**
 * Extracts line span (number of lines) from a function/symbol location.
 */
function getFunctionLineSpan(fn) {
  if (fn?.location?.startLine && fn?.location?.endLine) {
    return Math.max(1, fn.location.endLine - fn.location.startLine + 1);
  }
  return 0;
}

/**
 * Computes dynamic clone thresholds based on the repository's function size distribution.
 *
 * Guarantees:
 * - Minimum line floor is NEVER lower than 5 lines (strictly excluding 1-4 line snippets).
 * - Adapts to codebase norms using the median (p50) and IQR of function lengths.
 * - Enforces minimum duplicated volume so trivial abstractions are not suggested.
 */
function computeCloneThresholds(allFunctions) {
  if (!allFunctions || allFunctions.length < MIN_SAMPLE_SIZE) {
    return {
      minLines: ABSOLUTE_MIN_LINES,
      minSavings: ABSOLUTE_MIN_SAVINGS,
      p50: 0,
      p75: 0,
      p25: 0,
      iqr: 0,
      method: 'static-fallback',
    };
  }

  const sizes = allFunctions
    .map(fn => getFunctionLineSpan(fn))
    .filter(span => span > 0)
    .sort((a, b) => a - b);

  if (sizes.length < MIN_SAMPLE_SIZE) {
    return {
      minLines: ABSOLUTE_MIN_LINES,
      minSavings: ABSOLUTE_MIN_SAVINGS,
      p50: 0,
      p75: 0,
      p25: 0,
      iqr: 0,
      method: 'static-fallback',
    };
  }

  const p25 = quantile(sizes, 0.25);
  const p50 = quantile(sizes, 0.50);
  const p75 = quantile(sizes, 0.75);
  const iqr = p75 - p25;

  // Dynamic minimum line threshold:
  // In typical repositories, median function length is ~10-15 lines.
  // We scale the threshold proportionally to the median, clamped between 5 and 10 lines.
  const dynamicMinLines = Math.max(
    ABSOLUTE_MIN_LINES,
    Math.min(10, Math.round(p50 * 0.5))
  );

  return {
    minLines: dynamicMinLines,
    minSavings: Math.max(ABSOLUTE_MIN_SAVINGS, Math.round(dynamicMinLines * 2)),
    p50,
    p75,
    p25,
    iqr,
    method: 'statistical-iqr',
  };
}

/**
 * It traverses the syntax tree, then extracts node types while skipping literals,
 * and then it applies a hashing algorithm to return a structural fingerprint.
 *
 * Intelligent guards:
 * 1. Physical line span: blocks <= 4 lines (e.g. 1-4 lines) are trivial language
 *    idioms/accessors/handlers and are strictly excluded from clone hashing.
 * 2. Structural density: blocks with fewer than MIN_STRUCTURAL_ELEMENTS AST nodes
 *    lack substantive algorithmic logic and are discarded.
 */
function generateStructuralHash(node) {
  if (!node) return null;

  // Gate 1: Check physical line span if AST node contains position coordinates.
  const startRow = node.startPosition?.row;
  const endRow = node.endPosition?.row;
  if (startRow !== undefined && endRow !== undefined) {
    const lineSpan = endRow - startRow + 1;
    // Strictly prevent 1-4 lines from being identified as code copy
    if (lineSpan <= 4) return null;
  }

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
  // Gate 2: Meaningful structural mass. A non-trivial function with algorithmic
  // statements or control flow contains at least 16 non-literal AST nodes.
  if (elements < MIN_STRUCTURAL_ELEMENTS) return null;

  return cyrb53(structureStr);
}

/**
 * It maps all repository functions, then applies repository-relative thresholds
 * and multi-factor evaluation to return meaningful code clone alerts.
 */
function detectClones(allFunctions = [], filePath = '') {
  const thresholds = computeCloneThresholds(allFunctions);
  const hashMap = new Map();

  for (const fn of allFunctions) {
    if (!fn.hash) continue;

    const lineSpan = getFunctionLineSpan(fn);
    // Hard floor: strictly ignore 1-4 line functions, and any function below the dynamic threshold
    if (lineSpan > 0 && lineSpan < thresholds.minLines) continue;

    if (!hashMap.has(fn.hash)) {
      hashMap.set(fn.hash, []);
    }
    hashMap.get(fn.hash).push(fn);
  }

  const clones = [];
  const findings = [];

  for (const [hash, group] of hashMap.entries()) {
    if (group.length <= 1) continue;

    // Calculate group metrics
    const lineSpans = group.map(fn => getFunctionLineSpan(fn)).filter(s => s > 0);
    const avgLines = lineSpans.length > 0
      ? Math.round(lineSpans.reduce((a, b) => a + b, 0) / lineSpans.length)
      : 0;

    // Hard floor safeguard: If average lines <= 4, never treat as clone
    if (avgLines > 0 && avgLines <= 4) continue;

    const maxComplexity = Math.max(...group.map(fn => fn.complexity || 1));
    const filePaths = [...new Set(group.map(fn => fn.filePath || filePath).filter(Boolean))];

    // Complexity gate: If cyclomatic complexity is 1 (purely linear boilerplate),
    // require at least 8 lines or multi-file duplication to avoid trivial assignment/return noise.
    if (maxComplexity <= 1 && avgLines > 0 && avgLines < 8 && filePaths.length <= 1) {
      continue;
    }

    // Duplication savings impact
    const linesDuplicated = (group.length - 1) * (avgLines || thresholds.minLines);
    if (linesDuplicated < thresholds.minSavings && maxComplexity <= 1) {
      continue;
    }

    clones.push({
      hash,
      count: group.length,
      instances: group,
      avgLines,
      maxComplexity,
      filePaths,
      linesDuplicated,
      thresholds,
    });

    for (const instance of group) {
      const instLineSpan = getFunctionLineSpan(instance) || avgLines || 5;
      findings.push(
        createAnalysisFinding({
          id: `CLONE-${hash}-${instance.name}-${instance.location?.startLine || 0}`,
          analyzerId: 'clone',
          ruleId: 'STRUCTURAL_DUPLICATION',
          category: 'maintainability',
          severity: 'warning',
          title: `Code Clone Detected: ${instance.name || 'anonymous'}`,
          message: `This structure (~${instLineSpan} lines) is duplicated ${group.length} times across the codebase. Consider extracting it into a shared utility.`,
          filePath: instance.filePath || filePath,
          range: instance.location
            ? {
                startLine: instance.location.startLine,
                startColumn: instance.location.startColumn,
                endLine: instance.location.endLine,
                endColumn: instance.location.endColumn,
              }
            : undefined,
        })
      );
    }
  }

  clones.sort((a, b) => {
    // Sort by duplicated impact (lines duplicated * complexity), then instance count
    const impactA = (a.linesDuplicated || 0) * (a.maxComplexity || 1);
    const impactB = (b.linesDuplicated || 0) * (b.maxComplexity || 1);
    if (impactB !== impactA) return impactB - impactA;
    return b.count - a.count;
  });

  return { cloneGroups: clones, findings, thresholds };
}

export { generateStructuralHash, detectClones, computeCloneThresholds };
