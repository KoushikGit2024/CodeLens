/**
 * complexity.analyzer.js
 *
 * It receives a given AST node, then extracts cyclomatic branching logic,
 * and then it applies a base score calculation to output a final structural metric.
 */

const COMPLEXITY_NODE_TYPES = new Set([
  'if_statement',
  'if_expression', // Used in Kotlin/Rust
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'switch_case',
  'when_expression', // Used in Kotlin
  'binary_expression',
]);

/**
 * It walks the AST children, then extracts matching branch node types,
 * and then it applies an incremental counter to return the total cyclomatic score.
 */
function calculateComplexity(node) {
  let complexity = 1;

  function walk(n) {
    if (COMPLEXITY_NODE_TYPES.has(n.type)) {
      if (n.type === 'binary_expression') {
        const operatorNode = n.childForFieldName('operator');
        if (operatorNode) {
          // It evaluates the operator token, then extracts boolean comparators, and then it applies a complexity increment.
          const operator = operatorNode.text || operatorNode.type;
          if (operator === '&&' || operator === '||' || operator === '??') {
            complexity++;
          }
        }
      } else {
        complexity++;
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i));
    }
  }

  walk(node);
  return complexity;
}

export { calculateComplexity };
