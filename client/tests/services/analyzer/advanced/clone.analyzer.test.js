import { describe, it, expect } from 'vitest';
import {
  generateStructuralHash,
  detectClones,
  computeCloneThresholds,
} from '../../../../src/services/analyzer/advanced/clone.analyzer.js';

describe('clone.analyzer', () => {
  describe('generateStructuralHash', () => {
    it('returns null if node is null or undefined', () => {
      expect(generateStructuralHash(null)).toBeNull();
      expect(generateStructuralHash(undefined)).toBeNull();
    });

    it('returns null for functions spanning 1 to 4 lines (hard floor)', () => {
      // Helper to build a mock AST node
      const buildMockNode = (startRow, endRow, types) => {
        const root = {
          type: types[0] || 'function_declaration',
          startPosition: { row: startRow, column: 0 },
          endPosition: { row: endRow, column: 1 },
          childCount: 0,
          child: () => null,
        };
        const children = types.slice(1).map(t => ({
          type: t,
          childCount: 0,
          child: () => null,
        }));
        root.childCount = children.length;
        root.child = i => children[i];
        return root;
      };

      // 3-line function (rows 10 to 12 -> 3 lines)
      const threeLineNode = buildMockNode(10, 12, [
        'function_declaration',
        'formal_parameters',
        'statement_block',
        'return_statement',
        'binary_expression',
        'call_expression',
        'member_expression',
        'expression_statement',
        'if_statement',
        'binary_expression',
        'statement_block',
        'return_statement',
        'expression_statement',
        'call_expression',
        'arguments',
        'binary_expression',
        'statement_block',
      ]);
      expect(generateStructuralHash(threeLineNode)).toBeNull();

      // 4-line function (rows 20 to 23 -> 4 lines)
      const fourLineNode = buildMockNode(20, 23, [
        'function_declaration',
        'formal_parameters',
        'statement_block',
        'return_statement',
        'binary_expression',
        'call_expression',
        'member_expression',
        'expression_statement',
        'if_statement',
        'binary_expression',
        'statement_block',
        'return_statement',
        'expression_statement',
        'call_expression',
        'arguments',
        'binary_expression',
        'statement_block',
      ]);
      expect(generateStructuralHash(fourLineNode)).toBeNull();
    });

    it('returns null if node has fewer than 16 structural elements', () => {
      // 8-line function but with only 5 structural tokens (trivial boilerplate)
      const trivialNode = {
        type: 'function_declaration',
        startPosition: { row: 1, column: 0 },
        endPosition: { row: 8, column: 1 },
        childCount: 2,
        child: i =>
          [
            { type: 'formal_parameters', childCount: 0, child: () => null },
            {
              type: 'statement_block',
              childCount: 1,
              child: () => ({ type: 'return_statement', childCount: 0, child: () => null }),
            },
          ][i],
      };

      expect(generateStructuralHash(trivialNode)).toBeNull();
    });

    it('generates structural hash for substantive functions exceeding line and mass thresholds', () => {
      const types = [
        'function_declaration',
        'formal_parameters',
        'statement_block',
        'lexical_declaration',
        'variable_declarator',
        'for_of_statement',
        'variable_declarator',
        'statement_block',
        'if_statement',
        'binary_expression',
        'statement_block',
        'expression_statement',
        'call_expression',
        'member_expression',
        'arguments',
        'return_statement',
        'binary_expression',
      ];

      const children = types.slice(1).map(t => ({
        type: t,
        childCount: 0,
        child: () => null,
      }));

      const substantiveNode = {
        type: types[0],
        startPosition: { row: 1, column: 0 },
        endPosition: { row: 12, column: 1 }, // 12 lines
        childCount: children.length,
        child: i => children[i],
      };

      const hash = generateStructuralHash(substantiveNode);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });
  });

  describe('computeCloneThresholds', () => {
    it('returns fallback thresholds when functions array is empty or small', () => {
      const emptyThresholds = computeCloneThresholds([]);
      expect(emptyThresholds.minLines).toBe(5);
      expect(emptyThresholds.method).toBe('static-fallback');

      const smallThresholds = computeCloneThresholds([{ location: { startLine: 1, endLine: 6 } }]);
      expect(smallThresholds.minLines).toBe(5);
      expect(smallThresholds.method).toBe('static-fallback');
    });

    it('computes statistical quartiles and clamps minLines at or above 5', () => {
      const functions = [
        { location: { startLine: 1, endLine: 6 } }, // 6 lines
        { location: { startLine: 1, endLine: 10 } }, // 10 lines
        { location: { startLine: 1, endLine: 12 } }, // 12 lines
        { location: { startLine: 1, endLine: 16 } }, // 16 lines
        { location: { startLine: 1, endLine: 20 } }, // 20 lines
        { location: { startLine: 1, endLine: 28 } }, // 28 lines
      ];

      const thresholds = computeCloneThresholds(functions);
      expect(thresholds.method).toBe('statistical-iqr');
      expect(thresholds.p50).toBeGreaterThan(0);
      expect(thresholds.minLines).toBeGreaterThanOrEqual(5);
    });
  });

  describe('detectClones', () => {
    it('does NOT identify 3-4 line functions as code clones', () => {
      const threeLineFunctions = [
        {
          name: 'getUserId',
          hash: 'shared-hash-xyz',
          location: { startLine: 10, startColumn: 0, endLine: 12, endColumn: 1 }, // 3 lines
          filePath: 'src/user.js',
          complexity: 1,
        },
        {
          name: 'getOrderTotal',
          hash: 'shared-hash-xyz',
          location: { startLine: 25, startColumn: 0, endLine: 27, endColumn: 1 }, // 3 lines
          filePath: 'src/order.js',
          complexity: 1,
        },
      ];

      const { cloneGroups, findings } = detectClones(threeLineFunctions);
      expect(cloneGroups).toHaveLength(0);
      expect(findings).toHaveLength(0);
    });

    it('does NOT identify 4-line functions as code clones', () => {
      const fourLineFunctions = [
        {
          name: 'handleClose',
          hash: 'shared-hash-abc',
          location: { startLine: 1, startColumn: 0, endLine: 4, endColumn: 1 }, // 4 lines
          filePath: 'src/modalA.jsx',
          complexity: 1,
        },
        {
          name: 'handleDismiss',
          hash: 'shared-hash-abc',
          location: { startLine: 10, startColumn: 0, endLine: 13, endColumn: 1 }, // 4 lines
          filePath: 'src/modalB.jsx',
          complexity: 1,
        },
      ];

      const { cloneGroups, findings } = detectClones(fourLineFunctions);
      expect(cloneGroups).toHaveLength(0);
      expect(findings).toHaveLength(0);
    });

    it('identifies genuine multi-line duplicated functions across files', () => {
      const substantiveFunctions = [
        {
          name: 'calculateTaxRateA',
          hash: 'complex-calc-hash',
          location: { startLine: 10, startColumn: 0, endLine: 22, endColumn: 1 }, // 13 lines
          filePath: 'src/billing/taxA.js',
          complexity: 3,
        },
        {
          name: 'calculateTaxRateB',
          hash: 'complex-calc-hash',
          location: { startLine: 50, startColumn: 0, endLine: 62, endColumn: 1 }, // 13 lines
          filePath: 'src/billing/taxB.js',
          complexity: 3,
        },
      ];

      const { cloneGroups, findings } = detectClones(substantiveFunctions);
      expect(cloneGroups).toHaveLength(1);
      expect(cloneGroups[0].count).toBe(2);
      expect(cloneGroups[0].avgLines).toBe(13);
      expect(cloneGroups[0].filePaths).toEqual(['src/billing/taxA.js', 'src/billing/taxB.js']);

      expect(findings).toHaveLength(2);
      expect(findings[0].ruleId).toBe('STRUCTURAL_DUPLICATION');
      expect(findings[0].message).toContain('~13 lines');
    });

    it('filters out trivial intra-file linear functions with low complexity and savings', () => {
      const intraFileTrivial = [
        {
          name: 'formatA',
          hash: 'trivial-hash',
          location: { startLine: 10, startColumn: 0, endLine: 15, endColumn: 1 }, // 6 lines
          filePath: 'src/helpers.js',
          complexity: 1,
        },
        {
          name: 'formatB',
          hash: 'trivial-hash',
          location: { startLine: 20, startColumn: 0, endLine: 25, endColumn: 1 }, // 6 lines
          filePath: 'src/helpers.js',
          complexity: 1,
        },
      ];

      const { cloneGroups } = detectClones(intraFileTrivial);
      expect(cloneGroups).toHaveLength(0);
    });
  });
});
