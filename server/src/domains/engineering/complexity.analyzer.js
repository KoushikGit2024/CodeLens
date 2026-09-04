'use strict';

/**
 * complexity.analyzer.js
 *
 * Calculates Cyclomatic Complexity of a given Tree-sitter AST node.
 * It counts branching nodes such as if, for, while, catch, and logical operators.
 */

const COMPLEXITY_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'switch_case', // each case is a branch
  'binary_expression' // we will check for && and ||
]);

/**
 * Calculates the cyclomatic complexity of an AST node by walking its children.
 * Base complexity is 1.
 * 
 * @param {object} node - Tree-sitter syntax node
 * @returns {number} Complexity score
 */
function calculateComplexity(node) {
  let complexity = 1;

  function walk(n) {
    if (COMPLEXITY_NODE_TYPES.has(n.type)) {
      if (n.type === 'binary_expression') {
        const operatorNode = n.childForFieldName('operator');
        if (operatorNode) {
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

module.exports = {
  calculateComplexity
};
