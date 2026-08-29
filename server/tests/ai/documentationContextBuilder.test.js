const { buildOverviewContext, buildModuleContext } = require('../../src/ai/documentationContextBuilder');

describe('Documentation Context Builder', () => {
  const mockAnalysis = {
    name: 'test-repo',
    files: [
      { filePath: 'src/index.js', symbols: [{ kind: 'export', name: 'main' }] },
      { filePath: 'src/auth.js', symbols: [{ kind: 'export', name: 'login' }] }
    ]
  };

  const mockGraph = {
    nodes: [
      { id: 'file:src/index.js', type: 'file', filePath: 'src/index.js' },
      { id: 'file:src/auth.js', type: 'file', filePath: 'src/auth.js' },
      { id: 'pkg:express', type: 'package', name: 'express' }
    ],
    edges: [
      { source: 'file:src/index.js', target: 'file:src/auth.js', type: 'imports' },
      { source: 'file:src/index.js', target: 'pkg:express', type: 'imports' }
    ],
    meta: { unresolvedImports: 0 }
  };

  const mockArchitecture = {
    components: [
      { name: 'Core', layer: 'Service', files: ['src/index.js', 'src/auth.js'] }
    ],
    entryPoints: ['src/index.js'],
    apiBoundaries: [
      { filePath: 'src/auth.js', exports: ['login'] }
    ]
  };

  it('builds overview context correctly', () => {
    const ctx = buildOverviewContext(mockAnalysis, mockGraph, mockArchitecture);
    expect(ctx.projectName).toBe('test-repo');
    expect(ctx.meta.totalFiles).toBe(2);
    expect(ctx.meta.totalEdges).toBe(2);
    expect(ctx.entryPoints).toContain('src/index.js');
    expect(ctx.components.length).toBe(1);
    expect(ctx.keyExternalPackages).toContain('express');
  });

  it('builds module context correctly', () => {
    const ctx = buildModuleContext(mockAnalysis, mockGraph, mockArchitecture, 'src/index.js');
    expect(ctx.filePath).toBe('src/index.js');
    expect(ctx.component).toBe('Core');
    expect(ctx.layer).toBe('Service');
    expect(ctx.isApiBoundary).toBe(false);
    expect(ctx.dependencies).toContain('src/auth.js');
    expect(ctx.dependencies).toContain('express');
    expect(ctx.dependents.length).toBe(0);
  });
});
