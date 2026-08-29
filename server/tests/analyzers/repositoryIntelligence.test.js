const { buildRepositoryIntelligence, calculateHotspots } = require('../../src/analyzers/repositoryIntelligence');

describe('Repository Intelligence Analyzer', () => {
  let mockAnalysis;
  let mockGraph;
  let mockArchitecture;

  beforeEach(() => {
    mockAnalysis = {
      name: 'TestRepo',
      meta: { analysisVersion: 1 },
      languageSummary: { javascript: 3, python: 1 },
      files: [
        { filePath: 'src/index.js', symbols: [], language: 'javascript' },
        { filePath: 'src/utils.js', symbols: new Array(40).fill({}), language: 'javascript' }, // large
        { filePath: 'src/service.js', symbols: [], language: 'javascript' },
        { filePath: 'script.py', symbols: [], language: 'python' }
      ]
    };

    mockGraph = {
      meta: { unresolvedImports: 0 },
      nodes: [
        { id: 'file:src/index.js', type: 'file', filePath: 'src/index.js' },
        { id: 'file:src/utils.js', type: 'file', filePath: 'src/utils.js' },
        { id: 'file:src/service.js', type: 'file', filePath: 'src/service.js' },
        { id: 'file:script.py', type: 'file', filePath: 'script.py' }
      ],
      edges: [
        // index imports utils and service
        { source: 'file:src/index.js', target: 'file:src/utils.js' },
        { source: 'file:src/index.js', target: 'file:src/service.js' }
      ],
      cycles: []
    };

    mockArchitecture = {
      components: [
        { name: 'Core', layer: 'domain', files: ['src/service.js'] },
        { name: 'Utils', layer: 'shared', files: ['src/utils.js'] }
      ],
      entryPoints: ['src/index.js'],
      apiBoundaries: []
    };
  });

  test('calculateHotspots identifies correct hotspots', () => {
    // Add artificial edges to create a high fan-in utility
    for (let i = 0; i < 16; i++) {
      mockGraph.edges.push({ source: `file:src/other${i}.js`, target: 'file:src/utils.js' });
    }

    const mockRefactoring = { candidates: [] };
    const hotspots = calculateHotspots(mockAnalysis, mockGraph, mockArchitecture, mockRefactoring);
    
    // src/index.js -> entry point (20)
    // src/utils.js -> large file (10), high fan-in (10) -> (20)
    expect(hotspots.length).toBeGreaterThan(0);
    const indexHotspot = hotspots.find(h => h.filePath === 'src/index.js');
    expect(indexHotspot.score).toBe(20);
    expect(indexHotspot.reasons).toContain('Architectural entry point');
  });

  test('buildRepositoryIntelligence aggregates correctly', () => {
    const intel = buildRepositoryIntelligence(mockAnalysis, mockGraph, mockArchitecture);

    expect(intel.repository.name).toBe('TestRepo');
    expect(intel.repository.fileCount).toBe(4);
    expect(intel.architecture.components).toBe(2);
    expect(intel.dependencies.nodes).toBe(4);
    expect(intel.engineeringHealth).toHaveProperty('score');
    expect(intel.refactoring).toHaveProperty('candidateCount');
  });
});
