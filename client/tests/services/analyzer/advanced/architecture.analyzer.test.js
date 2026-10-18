import { describe, it, expect } from 'vitest';
import {
  calculateInstability,
  detectComponents,
  detectEntryPoints,
  buildArchitectureModel,
} from '../../../../src/services/analyzer/advanced/architecture.analyzer.js';
import {
  validateArchitecture,
  ARCHITECTURE_RULES,
} from '../../../../src/services/analyzer/advanced/architecture.rules.js';

describe('architecture.analyzer - Instability & Component Modeling', () => {
  describe('calculateInstability', () => {
    it('returns 0 when total coupling is 0', () => {
      expect(calculateInstability(0, 0)).toBe(0);
    });

    it('returns 0.0 for maximally stable module (Ce = 0, Ca > 0)', () => {
      expect(calculateInstability(5, 0)).toBe(0);
    });

    it('returns 1.0 for maximally volatile module (Ca = 0, Ce > 0)', () => {
      expect(calculateInstability(0, 5)).toBe(1);
    });

    it('correctly calculates fractional instability', () => {
      // Ce = 1, Ca = 3 -> 1 / (3 + 1) = 0.25 (Stable)
      expect(calculateInstability(3, 1)).toBe(0.25);

      // Ce = 3, Ca = 1 -> 3 / (1 + 3) = 0.75 (Volatile)
      expect(calculateInstability(1, 3)).toBe(0.75);

      // Ce = 2, Ca = 2 -> 2 / (2 + 2) = 0.50 (Balanced)
      expect(calculateInstability(2, 2)).toBe(0.5);
    });
  });

  describe('buildArchitectureModel - component metrics', () => {
    it('computes afferent coupling, efferent coupling, and instability for components', () => {
      const mockAnalysis = {
        files: [
          { filePath: 'src/core/model.js', symbols: [] },
          { filePath: 'src/services/user.service.js', symbols: [] },
          { filePath: 'src/controllers/user.controller.js', symbols: [{ kind: 'export', name: 'getUser' }] },
        ],
      };

      const mockGraph = {
        nodes: [
          { id: 'file:src/core/model.js', type: 'fileNode', data: { filePath: 'src/core/model.js' } },
          {
            id: 'file:src/services/user.service.js',
            type: 'fileNode',
            data: { filePath: 'src/services/user.service.js' },
          },
          {
            id: 'file:src/controllers/user.controller.js',
            type: 'fileNode',
            data: { filePath: 'src/controllers/user.controller.js' },
          },
        ],
        edges: [
          { source: 'file:src/services/user.service.js', target: 'file:src/core/model.js', type: 'default' },
          {
            source: 'file:src/controllers/user.controller.js',
            target: 'file:src/services/user.service.js',
            type: 'default',
          },
        ],
      };

      const model = buildArchitectureModel(mockAnalysis, mockGraph);

      expect(model.layers).toBeDefined();
      expect(model.uniqueRelations).toBeDefined();

      const modelComp = model.layers.find(c => c.data.label === 'core');
      const serviceComp = model.layers.find(c => c.data.label === 'services');
      const controllerComp = model.layers.find(c => c.data.label === 'controllers');

      expect(modelComp).toBeDefined();
      expect(serviceComp).toBeDefined();
      expect(controllerComp).toBeDefined();

      // core has 1 incoming (from services) and 0 outgoing -> Ca = 1, Ce = 0, I = 0
      expect(modelComp.data.metrics.afferentCoupling).toBe(1);
      expect(modelComp.data.metrics.efferentCoupling).toBe(0);
      expect(modelComp.data.metrics.instability).toBe(0);

      // controllers has 0 incoming and 1 outgoing (to services) -> Ca = 0, Ce = 1, I = 1
      expect(controllerComp.data.metrics.afferentCoupling).toBe(0);
      expect(controllerComp.data.metrics.efferentCoupling).toBe(1);
      expect(controllerComp.data.metrics.instability).toBe(1);

      // services has 1 incoming (from controllers) and 1 outgoing (to core) -> Ca = 1, Ce = 1, I = 0.5
      expect(serviceComp.data.metrics.afferentCoupling).toBe(1);
      expect(serviceComp.data.metrics.efferentCoupling).toBe(1);
      expect(serviceComp.data.metrics.instability).toBe(0.5);
    });
  });

  describe('architecture.rules - Stable Dependencies Principle (SDP)', () => {
    it('detects SDP violation when a stable component depends on an unstable component', () => {
      const components = [
        {
          id: 'comp-stable',
          data: {
            label: 'stable-core',
            layer: 'Data',
            metrics: {
              afferentCoupling: 4,
              efferentCoupling: 1,
              instability: 0.2, // Stable (<= 0.3, Ca >= 2)
            },
          },
        },
        {
          id: 'comp-volatile',
          data: {
            label: 'volatile-ui',
            layer: 'Presentation',
            metrics: {
              afferentCoupling: 1,
              efferentCoupling: 4,
              instability: 0.8, // Volatile (>= 0.7, Ce >= 2)
            },
          },
        },
      ];

      const edges = [
        {
          source: 'stable-core',
          target: 'volatile-ui',
          evidenceFile: 'src/core/stable.js',
        },
      ];

      const findings = validateArchitecture(components, edges);
      const sdpViolation = findings.find(f => f.ruleId === 'rule-stable-dependencies');

      expect(sdpViolation).toBeDefined();
      expect(sdpViolation.severity).toBe('warning');
      expect(sdpViolation.message).toContain('Stable Dependencies Principle violation');
      expect(sdpViolation.sourceComponent).toBe('stable-core');
      expect(sdpViolation.targetComponent).toBe('volatile-ui');
    });

    it('does not flag SDP when dependency points towards stability', () => {
      const components = [
        {
          id: 'comp-volatile',
          data: {
            label: 'volatile-ui',
            layer: 'Presentation',
            metrics: {
              afferentCoupling: 0,
              efferentCoupling: 4,
              instability: 1.0,
            },
          },
        },
        {
          id: 'comp-stable',
          data: {
            label: 'stable-core',
            layer: 'Core/Other',
            metrics: {
              afferentCoupling: 4,
              efferentCoupling: 0,
              instability: 0.0,
            },
          },
        },
      ];

      const edges = [
        {
          source: 'volatile-ui',
          target: 'stable-core',
          evidenceFile: 'src/ui/app.js',
        },
      ];

      const findings = validateArchitecture(components, edges);
      const sdpViolation = findings.find(f => f.ruleId === 'rule-stable-dependencies');

      expect(sdpViolation).toBeUndefined();
    });
  });
});
