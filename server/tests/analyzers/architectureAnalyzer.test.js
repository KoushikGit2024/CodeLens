const { buildArchitectureModel } = require('../../src/analyzers/architectureAnalyzer');
const { generateSystemOverview } = require('../../src/analyzers/mermaidGenerator');

describe('Architecture Analyzer', () => {
  it('detects components and entry points correctly', () => {
    const analysis = {
      files: [
        { filePath: 'src/index.js', symbols: [] },
        { filePath: 'src/controllers/userController.js', symbols: [{ kind: 'export', name: 'getUser' }] },
        { filePath: 'src/services/userService.js', symbols: [] }
      ]
    };

    const graph = {
      nodes: [
        { id: 'file:src/index.js', type: 'file', filePath: 'src/index.js' },
        { id: 'file:src/controllers/userController.js', type: 'file', filePath: 'src/controllers/userController.js' },
        { id: 'file:src/services/userService.js', type: 'file', filePath: 'src/services/userService.js' }
      ],
      edges: [
        { source: 'file:src/index.js', target: 'file:src/controllers/userController.js', type: 'imports' },
        { source: 'file:src/controllers/userController.js', target: 'file:src/services/userService.js', type: 'imports' }
      ]
    };

    const model = buildArchitectureModel(analysis, graph);
    expect(model.components.length).toBe(3); // root, controllers, services
    expect(model.entryPoints).toContain('src/index.js');
    expect(model.apiBoundaries.length).toBe(1);
    expect(model.apiBoundaries[0].filePath).toBe('src/controllers/userController.js');
  });
});

describe('Mermaid Generator', () => {
  it('generates a valid flowchart TD', () => {
    const model = {
      components: [
        { name: 'controllers', layer: 'API' },
        { name: 'services', layer: 'Service' }
      ],
      relations: [
        { source: 'controllers', target: 'services', targetType: 'internal' }
      ]
    };
    const mermaid = generateSystemOverview(model);
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('controllers --> services');
  });
});
