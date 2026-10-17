/**
 * complexity.analyzer.js
 *
 * It evaluates AST nodes to compute deterministic code complexity metrics:
 * 1. McCabe Cyclomatic Complexity (pure branch counting)
 * 2. SonarSource Cognitive Complexity (nesting-penalized cognitive load)
 * 3. Maximum Nesting Depth (deepest nested block)
 * 4. Maintainability Index (MI: 0–100 standardized rating)
 */

// ── Node Classification ───────────────────────────────────────────────────────

const CYCLOMATIC_BRANCH_TYPES = new Set([
  'if_statement',
  'if_expression',
  'ternary_expression',
  'conditional_expression',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'do_while_statement',
  'enhanced_for_statement',
  'for_expression',
  'repeat_while_statement',
  'catch_clause',
  'except_clause',
  'switch_case',
  'when_entry',
  'case_statement',
]);

const COGNITIVE_STRUCTURAL_TYPES = new Set([
  'if_statement',
  'if_expression',
  'ternary_expression',
  'conditional_expression',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'do_while_statement',
  'enhanced_for_statement',
  'for_expression',
  'repeat_while_statement',
  'catch_clause',
  'except_clause',
  'switch_statement',
  'switch_expression',
  'when_expression',
  'match_expression',
]);

const NESTING_CONTAINER_TYPES = new Set([
  'if_statement',
  'if_expression',
  'else_clause',
  'ternary_expression',
  'conditional_expression',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'do_while_statement',
  'enhanced_for_statement',
  'for_expression',
  'repeat_while_statement',
  'catch_clause',
  'except_clause',
  'switch_statement',
  'switch_expression',
  'when_expression',
  'match_expression',
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
]);

const IGNORED_HALSTEAD_TYPES = new Set([
  'comment',
  ';',
  ',',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
]);

// ── Cyclomatic Complexity ─────────────────────────────────────────────────────

/**
 * Calculates standard McCabe Cyclomatic Complexity.
 * Starts at base 1, adding +1 for each decision branch and boolean operator.
 */
function calculateComplexity(node) {
  if (!node) return 1;
  let cyclomatic = 1;

  function walk(n) {
    if (CYCLOMATIC_BRANCH_TYPES.has(n.type)) {
      cyclomatic++;
    } else if (n.type === 'binary_expression' || n.type === 'logical_expression' || n.type === 'boolean_operator') {
      const operatorNode = n.childForFieldName ? n.childForFieldName('operator') : null;
      const op = operatorNode ? (operatorNode.text || operatorNode.type) : n.type;
      if (op === '&&' || op === '||' || op === '??' || op === 'and' || op === 'or') {
        cyclomatic++;
      }
    }

    const count = n.childCount || 0;
    for (let i = 0; i < count; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  }

  walk(node);
  return cyclomatic;
}

// ── Cognitive Complexity ──────────────────────────────────────────────────────

/**
 * Calculates SonarSource-style Cognitive Complexity.
 * Increments for flow-breaking structures, and applies a compounding nesting
 * penalty for structures inside nested control scopes.
 */
function calculateCognitiveComplexity(node) {
  if (!node) return { score: 0, maxNestingDepth: 0 };

  let cognitive = 0;
  let maxNestingDepth = 0;

  function walk(n, nestingLevel, isRoot) {
    let nextNestingLevel = nestingLevel;
    const isContainer = !isRoot && NESTING_CONTAINER_TYPES.has(n.type);

    if (isContainer) {
      nextNestingLevel = nestingLevel + 1;
      maxNestingDepth = Math.max(maxNestingDepth, nextNestingLevel);
    }

    if (!isRoot && COGNITIVE_STRUCTURAL_TYPES.has(n.type)) {
      // B1: Structural increment (+1) + B2: Nesting penalty (+ nestingLevel)
      cognitive += 1 + nestingLevel;
    } else if (n.type === 'else_clause') {
      // In SonarSource spec, `else` or `else if` adds +1 structural, but no nesting penalty
      cognitive += 1;
    } else if (n.type === 'binary_expression' || n.type === 'logical_expression' || n.type === 'boolean_operator') {
      const operatorNode = n.childForFieldName ? n.childForFieldName('operator') : null;
      const op = operatorNode ? (operatorNode.text || operatorNode.type) : n.type;
      if (op === '&&' || op === '||' || op === '??' || op === 'and' || op === 'or') {
        // Boolean operator sequences add +1 without nesting penalty
        cognitive += 1;
      }
    }

    const count = n.childCount || 0;
    for (let i = 0; i < count; i++) {
      const child = n.child(i);
      if (child) walk(child, nextNestingLevel, false);
    }
  }

  walk(node, 0, true);
  return { score: cognitive, maxNestingDepth };
}

// ── Maintainability Index ─────────────────────────────────────────────────────

/**
 * Calculates the standard Maintainability Index (0–100 scale).
 * Combines Halstead volume approximation, cognitive complexity, and lines of code.
 */
function calculateMaintainabilityIndex(node, cognitiveScore, lineSpan) {
  if (!node) return 100;

  let totalTokens = 0;
  const uniqueTypes = new Set();

  function walk(n) {
    if (!IGNORED_HALSTEAD_TYPES.has(n.type)) {
      totalTokens++;
      uniqueTypes.add(n.type);
    }
    const count = n.childCount || 0;
    for (let i = 0; i < count; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  }

  walk(node);

  const N = Math.max(1, totalTokens);
  const eta = Math.max(2, uniqueTypes.size);
  const V = N * Math.log2(eta); // Halstead Volume
  const sloc = Math.max(1, lineSpan || 1);
  const cc = Math.max(0, cognitiveScore);

  // Standard SEI Maintainability Index formula:
  // MI = 171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(SLOC)
  const rawMI = 171 - 5.2 * Math.log(V) - 0.23 * cc - 16.2 * Math.log(sloc);
  // Normalize to 0–100
  return Math.max(0, Math.min(100, Math.round((rawMI * 100) / 171)));
}

function getRating(maintainabilityIndex) {
  if (maintainabilityIndex >= 80) return 'A';
  if (maintainabilityIndex >= 65) return 'B';
  if (maintainabilityIndex >= 50) return 'C';
  if (maintainabilityIndex >= 35) return 'D';
  return 'F';
}

// ── Composite Analyzer ────────────────────────────────────────────────────────

/**
 * Full multi-dimensional complexity analysis of an AST node.
 */
function analyzeComplexity(node) {
  if (!node) {
    return {
      cyclomatic: 1,
      cognitive: 0,
      maxNestingDepth: 0,
      maintainabilityIndex: 100,
      rating: 'A',
    };
  }

  const startRow = node.startPosition?.row;
  const endRow = node.endPosition?.row;
  const lineSpan = startRow !== undefined && endRow !== undefined ? endRow - startRow + 1 : 1;

  const cyclomatic = calculateComplexity(node);
  const { score: cognitive, maxNestingDepth } = calculateCognitiveComplexity(node);
  const maintainabilityIndex = calculateMaintainabilityIndex(node, cognitive, lineSpan);
  const rating = getRating(maintainabilityIndex);

  return {
    cyclomatic,
    cognitive,
    maxNestingDepth,
    maintainabilityIndex,
    rating,
  };
}

export {
  calculateComplexity,
  calculateCognitiveComplexity,
  calculateMaintainabilityIndex,
  analyzeComplexity,
};
