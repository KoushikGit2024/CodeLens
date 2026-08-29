const { buildEngineeringRiskModel, RISK_CATEGORIES, SEVERITY } = require('../../src/analyzers/engineeringRiskAnalyzer');

describe('Engineering Risk Analyzer', () => {
  it('identifies file size and export risks', () => {
    const analysis = {
      files: [
        {
          filePath: 'huge.js',
          lineCount: 600,
          symbols: []
        },
        {
          filePath: 'api.js',
          lineCount: 100,
          symbols: Array(20).fill({ kind: 'export', name: 'foo' })
        }
      ]
    };

    const graph = { nodes: [], edges: [], meta: {} };
    const architecture = { components: [], relations: [] };

    const model = buildEngineeringRiskModel(analysis, graph, architecture);

    expect(model.risks.length).toBe(2);
    expect(model.risks.some(r => r.file === 'huge.js' && r.severity === SEVERITY.HIGH)).toBe(true);
    expect(model.risks.some(r => r.file === 'api.js' && r.severity === SEVERITY.WARNING)).toBe(true);
  });

  it('identifies dependency cycles and unresolved imports', () => {
    const analysis = { files: [] };
    const graph = { nodes: [], edges: [], meta: {} };
    const architecture = {
      cycles: [['a.js', 'b.js', 'a.js']],
      unresolvedDependencies: 5
    };

    const model = buildEngineeringRiskModel(analysis, graph, architecture);

    expect(model.risks.some(r => r.category === RISK_CATEGORIES.DEPENDENCY && r.severity === SEVERITY.CRITICAL)).toBe(true);
    expect(model.risks.some(r => r.category === RISK_CATEGORIES.DEPENDENCY && r.severity === SEVERITY.HIGH)).toBe(true);
  });

  it('identifies cross-layer violations', () => {
    const analysis = { files: [] };
    const graph = { nodes: [], edges: [], meta: {} };
    const architecture = {
      components: [
        { name: 'UI', layer: 'Presentation' },
        { name: 'DB', layer: 'Data' }
      ],
      relations: [
        { source: 'UI', target: 'DB', targetType: 'internal', evidenceFile: 'ui.js' }
      ]
    };

    const model = buildEngineeringRiskModel(analysis, graph, architecture);

    expect(model.risks.some(r => r.category === RISK_CATEGORIES.ARCHITECTURE && r.severity === SEVERITY.HIGH)).toBe(true);
  });
});
