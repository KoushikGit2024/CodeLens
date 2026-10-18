import { describe, it, expect } from 'vitest';
import {
  analyzeChangeImpact,
  determineRiskTier,
  getNodeCentralityWeight,
} from '../../../../src/services/analyzer/advanced/change.impact.js';

describe('change.impact analyzer', () => {
  describe('helper calculations', () => {
    it('calculates centrality weight correctly based on in-degree', () => {
      const mockGraph = {
        nodes: [{ id: 'file:target.js' }],
        edges: [
          { source: 'file:a.js', target: 'file:target.js' },
          { source: 'file:b.js', target: 'file:target.js' },
          { source: 'file:c.js', target: 'file:target.js' },
        ],
      };

      const weight = getNodeCentralityWeight(mockGraph, 'target.js');
      // inDegree is 3. 1 + log2(1 + 3) = 1 + log2(4) = 3.0
      expect(weight).toBeCloseTo(3.0, 1);

      // 0 in-degree returns 1.0
      const zeroWeight = getNodeCentralityWeight(mockGraph, 'nonexistent.js');
      expect(zeroWeight).toBe(1.0);
    });

    it('determines risk tiers deterministically', () => {
      expect(determineRiskTier(0, 0, 0, 0)).toBe('none');
      expect(determineRiskTier(2, 3.5, 1, 0)).toBe('low');
      expect(determineRiskTier(6, 12.0, 2, 0)).toBe('moderate');
      expect(determineRiskTier(15, 22.0, 3, 1)).toBe('high');
      expect(determineRiskTier(30, 42.0, 4, 3)).toBe('critical');
    });
  });

  describe('analyzeChangeImpact', () => {
    it('returns empty result when no files are changed', () => {
      const res = analyzeChangeImpact({}, {}, []);
      expect(res.changedFiles).toEqual([]);
      expect(res.directlyAffectedFiles).toEqual([]);
      expect(res.transitivelyAffectedFiles).toEqual([]);
      expect(res.riskTier).toBe('none');
      expect(res.blastRadiusScore).toBe(0);
      expect(res.findings).toEqual([]);
    });

    it('correctly maps direct and transitive dependents with decaying depth weights', () => {
      // Chain: client.js -> service.js -> db.js
      // db.js is imported by service.js (service imports db: source=service, target=db)
      // service.js is imported by client.js (client imports service: source=client, target=service)
      const graph = {
        nodes: [
          { id: 'file:src/db.js', type: 'fileNode', data: { filePath: 'src/db.js', layer: 'Data' } },
          { id: 'file:src/service.js', type: 'fileNode', data: { filePath: 'src/service.js', layer: 'Service' } },
          { id: 'file:src/client.js', type: 'fileNode', data: { filePath: 'src/client.js', layer: 'Presentation' } },
        ],
        edges: [
          { source: 'file:src/service.js', target: 'file:src/db.js', data: {} },
          { source: 'file:src/client.js', target: 'file:src/service.js', data: {} },
        ],
      };

      const analysis = {
        files: [{ filePath: 'src/db.js' }, { filePath: 'src/service.js' }, { filePath: 'src/client.js' }],
      };

      // Modifying db.js:
      // Direct dependent: service.js (depth 1)
      // Transitive dependent: client.js (depth 2)
      const result = analyzeChangeImpact(analysis, graph, ['src/db.js']);

      expect(result.changedFiles).toEqual(['src/db.js']);
      expect(result.directlyAffectedFiles).toEqual(['src/service.js']);
      expect(result.transitivelyAffectedFiles).toEqual(['src/client.js']);

      expect(result.maxDepth).toBe(2);
      expect(result.affectedByDepth['1']).toEqual(['src/service.js']);
      expect(result.affectedByDepth['2']).toEqual(['src/client.js']);

      // Depth 1: decay 1.0 * centrality 2.0 = 2.0
      // Depth 2: decay 0.5 * centrality 1.0 = 0.5
      // Total score: ~2.5
      expect(result.blastRadiusScore).toBeGreaterThan(0);
      expect(result.riskTier).toBeDefined();
    });

    it('identifies critical hub files in downstream blast radius', () => {
      // 5 files import hub.js -> hub.js has in-degree 5
      const edges = [
        { source: 'file:app/a.js', target: 'file:app/hub.js', data: {} },
        { source: 'file:app/b.js', target: 'file:app/hub.js', data: {} },
        { source: 'file:app/c.js', target: 'file:app/hub.js', data: {} },
        { source: 'file:app/d.js', target: 'file:app/hub.js', data: {} },
        { source: 'file:app/e.js', target: 'file:app/hub.js', data: {} },
        // hub.js imports core.js
        { source: 'file:app/hub.js', target: 'file:app/core.js', data: {} },
      ];

      const nodes = [
        { id: 'file:app/core.js', type: 'fileNode', data: { filePath: 'app/core.js', layer: 'Core' } },
        { id: 'file:app/hub.js', type: 'fileNode', data: { filePath: 'app/hub.js', layer: 'Service' } },
        { id: 'file:app/a.js', type: 'fileNode', data: { filePath: 'app/a.js', layer: 'Presentation' } },
        { id: 'file:app/b.js', type: 'fileNode', data: { filePath: 'app/b.js', layer: 'Presentation' } },
        { id: 'file:app/c.js', type: 'fileNode', data: { filePath: 'app/c.js', layer: 'Presentation' } },
        { id: 'file:app/d.js', type: 'fileNode', data: { filePath: 'app/d.js', layer: 'Presentation' } },
        { id: 'file:app/e.js', type: 'fileNode', data: { filePath: 'app/e.js', layer: 'Presentation' } },
      ];

      const analysis = { files: nodes.map(n => ({ filePath: n.data.filePath })) };
      const graph = { nodes, edges };

      // Changing core.js ripples into hub.js, which is a critical hub with in-degree 5!
      const result = analyzeChangeImpact(analysis, graph, ['app/core.js']);

      expect(result.directlyAffectedFiles).toContain('app/hub.js');
      expect(result.criticalHubFiles.length).toBeGreaterThanOrEqual(1);
      expect(result.criticalHubFiles[0].filePath).toBe('app/hub.js');
      expect(result.criticalHubFiles[0].inDegree).toBe(5);

      // Transitive ripples out to a, b, c, d, e
      expect(result.transitivelyAffectedFiles).toHaveLength(5);
    });

    it('generates a finding for high change impact blast radiuses', () => {
      // Create a wide blast radius graph with 15 dependents
      const nodes = [{ id: 'file:base.js', type: 'fileNode', data: { filePath: 'base.js', layer: 'Core' } }];
      const edges = [];

      for (let i = 1; i <= 15; i++) {
        const file = `user_${i}.js`;
        nodes.push({ id: `file:${file}`, type: 'fileNode', data: { filePath: file, layer: 'Presentation' } });
        edges.push({ source: `file:${file}`, target: 'file:base.js', data: {} });
      }

      const analysis = { files: nodes.map(n => ({ filePath: n.data.filePath })) };
      const graph = { nodes, edges };

      const result = analyzeChangeImpact(analysis, graph, ['base.js']);

      expect(result.directlyAffectedFiles.length).toBe(15);
      expect(result.riskTier).toBe('high');
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Blast Radius: HIGH');
    });
  });
});
