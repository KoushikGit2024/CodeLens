import { describe, it, expect } from 'vitest';
import {
  computeCouplingThresholds,
  buildEngineeringRiskModel,
  SEVERITY,
  RISK_CATEGORIES,
} from '../../../../src/services/analyzer/advanced/risk.analyzer.js';

describe('risk.analyzer - Statistical Coupling & Instability Index (SDP)', () => {
  describe('computeCouplingThresholds', () => {
    it('returns static fallback when fewer than 4 files are provided', () => {
      const mockAnalysis = {
        files: [{ filePath: 'a.js' }, { filePath: 'b.js' }],
      };
      const mockGraph = { edges: [] };

      const thresholds = computeCouplingThresholds(mockAnalysis, mockGraph);
      expect(thresholds.fanIn.method).toBe('static-fallback');
      expect(thresholds.fanIn.warning).toBe(10);
      expect(thresholds.fanIn.high).toBe(20);
      expect(thresholds.fanOut.method).toBe('static-fallback');
      expect(thresholds.fanOut.warning).toBe(15);
      expect(thresholds.fanOut.high).toBe(25);
    });

    it('computes Tukey IQR fences when sufficient distribution exists', () => {
      const mockFiles = [
        { filePath: 'f1.js' },
        { filePath: 'f2.js' },
        { filePath: 'f3.js' },
        { filePath: 'f4.js' },
        { filePath: 'f5.js' },
        { filePath: 'f6.js' },
        { filePath: 'f7.js' },
        { filePath: 'f8.js' },
      ];

      // f1 is depended on by f2, f3, f4, f5, f6, f7, f8 (fanIn = 7)
      // others have 0 incoming edges
      const edges = [
        { source: 'file:f2.js', target: 'file:f1.js' },
        { source: 'file:f3.js', target: 'file:f1.js' },
        { source: 'file:f4.js', target: 'file:f1.js' },
        { source: 'file:f5.js', target: 'file:f1.js' },
        { source: 'file:f6.js', target: 'file:f1.js' },
        { source: 'file:f7.js', target: 'file:f1.js' },
        { source: 'file:f8.js', target: 'file:f1.js' },
      ];

      const thresholds = computeCouplingThresholds({ files: mockFiles }, { edges });
      expect(thresholds.fanIn).toBeDefined();
      expect(thresholds.fanOut).toBeDefined();
      // Should respect absolute floors: warning at least 8, high at least 16
      expect(thresholds.fanIn.warning).toBeGreaterThanOrEqual(8);
      expect(thresholds.fanIn.high).toBeGreaterThanOrEqual(16);
      expect(thresholds.fanOut.warning).toBeGreaterThanOrEqual(10);
      expect(thresholds.fanOut.high).toBeGreaterThanOrEqual(20);
    });
  });

  describe('analyzeStabilityRisks & SDP Violations', () => {
    it('detects Stable Dependencies Principle violation when a stable module imports a volatile module', () => {
      // Setup:
      // module 'stable.js' has Ca = 4 (depended on by dep1, dep2, dep3, dep4) and Ce = 1 (imports volatile.js)
      // -> Instability = 1 / (4 + 1) = 0.20 (Stable, Ca >= 3, I <= 0.3)
      //
      // module 'volatile.js' has Ca = 1 (depended on by stable.js) and Ce = 3 (imports leaf1, leaf2, leaf3)
      // -> Instability = 3 / (1 + 3) = 0.75 (Volatile, Ce >= 3, I >= 0.7)
      const files = [
        { filePath: 'src/stable.js', symbols: [] },
        { filePath: 'src/volatile.js', symbols: [] },
        { filePath: 'src/dep1.js', symbols: [] },
        { filePath: 'src/dep2.js', symbols: [] },
        { filePath: 'src/dep3.js', symbols: [] },
        { filePath: 'src/dep4.js', symbols: [] },
        { filePath: 'src/leaf1.js', symbols: [] },
        { filePath: 'src/leaf2.js', symbols: [] },
        { filePath: 'src/leaf3.js', symbols: [] },
      ];

      const edges = [
        // stable.js has 4 incoming
        { source: 'file:src/dep1.js', target: 'file:src/stable.js' },
        { source: 'file:src/dep2.js', target: 'file:src/stable.js' },
        { source: 'file:src/dep3.js', target: 'file:src/stable.js' },
        { source: 'file:src/dep4.js', target: 'file:src/stable.js' },

        // stable.js imports volatile.js (THE SDP VIOLATION EDGE)
        { source: 'file:src/stable.js', target: 'file:src/volatile.js' },

        // volatile.js imports 3 leaves
        { source: 'file:src/volatile.js', target: 'file:src/leaf1.js' },
        { source: 'file:src/volatile.js', target: 'file:src/leaf2.js' },
        { source: 'file:src/volatile.js', target: 'file:src/leaf3.js' },
      ];

      const nodes = files.map(f => ({
        id: `file:${f.filePath}`,
        type: 'fileNode',
        data: { filePath: f.filePath },
      }));

      const model = buildEngineeringRiskModel({ files }, { nodes, edges }, {});
      const sdpRisks = model.risks.filter(r => r.title === 'Stable Dependencies Principle Violation');

      expect(sdpRisks.length).toBeGreaterThan(0);
      const risk = sdpRisks[0];
      expect(risk.category).toBe(RISK_CATEGORIES.ARCHITECTURE);
      expect(risk.severity).toBe(SEVERITY.WARNING);
      expect(risk.file).toBe('src/stable.js');
      expect(risk.evidence.sourceFile).toBe('src/stable.js');
      expect(risk.evidence.targetFile).toBe('src/volatile.js');
      expect(risk.evidence.sourceInstability).toBeLessThanOrEqual(0.3);
      expect(risk.evidence.targetInstability).toBeGreaterThanOrEqual(0.7);
    });

    it('ensures coupling and SDP issues have significantly discounted penalty (1 point)', () => {
      const files = [
        { filePath: 'src/stable.js', symbols: [] },
        { filePath: 'src/volatile.js', symbols: [] },
        { filePath: 'src/dep1.js', symbols: [] },
        { filePath: 'src/dep2.js', symbols: [] },
        { filePath: 'src/dep3.js', symbols: [] },
        { filePath: 'src/leaf1.js', symbols: [] },
        { filePath: 'src/leaf2.js', symbols: [] },
        { filePath: 'src/leaf3.js', symbols: [] },
      ];

      const edges = [
        { source: 'file:src/dep1.js', target: 'file:src/stable.js' },
        { source: 'file:src/dep2.js', target: 'file:src/stable.js' },
        { source: 'file:src/dep3.js', target: 'file:src/stable.js' },
        { source: 'file:src/stable.js', target: 'file:src/volatile.js' },
        { source: 'file:src/volatile.js', target: 'file:src/leaf1.js' },
        { source: 'file:src/volatile.js', target: 'file:src/leaf2.js' },
        { source: 'file:src/volatile.js', target: 'file:src/leaf3.js' },
      ];

      const nodes = files.map(f => ({
        id: `file:${f.filePath}`,
        type: 'fileNode',
        data: { filePath: f.filePath },
      }));

      const model = buildEngineeringRiskModel({ files }, { nodes, edges }, {});
      // Even with warning/high coupling or SDP issues, overall health score should remain high (> 90)
      expect(model.score).toBeGreaterThanOrEqual(95);
    });
  });
});
