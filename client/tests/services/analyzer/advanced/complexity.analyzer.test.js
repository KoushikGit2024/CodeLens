import { describe, it, expect } from 'vitest';
import {
  calculateComplexity,
  calculateCognitiveComplexity,
  calculateMaintainabilityIndex,
  analyzeComplexity,
} from '../../../../src/services/analyzer/advanced/complexity.analyzer.js';

describe('complexity.analyzer', () => {
  // Helper to build a mock tree-sitter node structure
  const makeNode = (type, children = [], fields = {}, lineSpan = 5) => {
    return {
      type,
      startPosition: { row: 1, column: 0 },
      endPosition: { row: lineSpan, column: 1 },
      childCount: children.length,
      child: i => children[i] || null,
      childForFieldName: name => fields[name] || null,
    };
  };

  describe('calculateComplexity (McCabe Cyclomatic)', () => {
    it('returns base complexity 1 for null or simple linear node', () => {
      expect(calculateComplexity(null)).toBe(1);
      const linear = makeNode('statement_block', [
        makeNode('expression_statement'),
        makeNode('return_statement'),
      ]);
      expect(calculateComplexity(linear)).toBe(1);
    });

    it('adds +1 for each decision branch (if, for, while, catch)', () => {
      const branched = makeNode('statement_block', [
        makeNode('if_statement'),
        makeNode('for_statement'),
        makeNode('while_statement'),
        makeNode('catch_clause'),
      ]);
      // 1 base + 4 branches = 5
      expect(calculateComplexity(branched)).toBe(5);
    });

    it('adds +1 for boolean logical operators (&&, ||, ??)', () => {
      const logicalNode = makeNode('statement_block', [
        makeNode('binary_expression', [], { operator: { text: '&&' } }),
        makeNode('binary_expression', [], { operator: { text: '||' } }),
        makeNode('binary_expression', [], { operator: { text: '??' } }),
      ]);
      // 1 base + 3 operators = 4
      expect(calculateComplexity(logicalNode)).toBe(4);
    });
  });

  describe('calculateCognitiveComplexity (SonarSource)', () => {
    it('returns 0 for null or simple linear block', () => {
      expect(calculateCognitiveComplexity(null)).toEqual({ score: 0, maxNestingDepth: 0 });
      const linear = makeNode('statement_block', [makeNode('return_statement')]);
      expect(calculateCognitiveComplexity(linear)).toEqual({ score: 0, maxNestingDepth: 0 });
    });

    it('scores flat sequential branches without nesting penalty', () => {
      // 3 sequential top-level if statements: +1 each = 3
      const flat = makeNode('statement_block', [
        makeNode('if_statement'),
        makeNode('if_statement'),
        makeNode('if_statement'),
      ]);

      const res = calculateCognitiveComplexity(flat);
      expect(res.score).toBe(3);
      expect(res.maxNestingDepth).toBe(1);
    });

    it('compounds nesting penalties for deeply nested control structures', () => {
      // Outer if (nesting 0 -> +1)
      //   -> inner for (nesting 1 -> +1 structural + 1 penalty = +2)
      //     -> innermost while (nesting 2 -> +1 structural + 2 penalty = +3)
      // Total cognitive = 1 + 2 + 3 = 6
      const innermostWhile = makeNode('while_statement');
      const innerFor = makeNode('for_statement', [innermostWhile]);
      const outerIf = makeNode('if_statement', [innerFor]);
      const root = makeNode('statement_block', [outerIf]);

      const res = calculateCognitiveComplexity(root);
      expect(res.score).toBe(6);
      expect(res.maxNestingDepth).toBe(3);
    });

    it('increments for else_clause without additional nesting penalty', () => {
      const ifWithElse = makeNode('statement_block', [
        makeNode('if_statement', [
          makeNode('else_clause'),
        ]),
      ]);

      const res = calculateCognitiveComplexity(ifWithElse);
      // if_statement: +1. else_clause: +1. Total = 2
      expect(res.score).toBe(2);
    });
  });

  describe('calculateMaintainabilityIndex', () => {
    it('returns high score (~A rating) for small clean functions', () => {
      const cleanNode = makeNode('statement_block', [
        makeNode('return_statement'),
      ], {}, 3);

      const mi = calculateMaintainabilityIndex(cleanNode, 0, 3);
      expect(mi).toBeGreaterThanOrEqual(80);
    });

    it('returns reduced score for high cognitive load and long files', () => {
      const complexNode = makeNode('statement_block', [
        makeNode('for_statement'),
        makeNode('if_statement'),
        makeNode('while_statement'),
      ], {}, 120);

      const mi = calculateMaintainabilityIndex(complexNode, 25, 120);
      expect(mi).toBeLessThan(70);
    });
  });

  describe('analyzeComplexity', () => {
    it('returns comprehensive composite metrics with rating', () => {
      const node = makeNode('statement_block', [
        makeNode('if_statement', [
          makeNode('for_statement'),
        ]),
      ], {}, 10);

      const result = analyzeComplexity(node);

      expect(result.cyclomatic).toBe(3); // 1 base + 1 if + 1 for
      expect(result.cognitive).toBe(3);  // 1 (if) + (1+1 for) = 3
      expect(result.maxNestingDepth).toBe(2);
      expect(result.maintainabilityIndex).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.rating);
    });
  });
});
