/**
 * tests/analyzers/dependencyGraph.test.js
 *
 * Comprehensive tests for the dependency graph builder.
 *
 * Tests cover:
 *   - Node creation (file + package nodes)
 *   - Edge creation (imports, requires, depends_on)
 *   - Internal vs external distinction
 *   - Duplicate edge deduplication
 *   - Circular dependencies (no crash, faithfully represented)
 *   - Isolated files
 *   - Cycle detection
 *   - getFileDependencies() derived query
 *   - getIsolatedFiles() derived query
 *   - detectCycles() correctness
 *   - Mixed internal/external dependencies
 *   - Unresolved imports are excluded from edges
 *   - Deterministic output (sorted nodes/edges)
 */

'use strict';

const {
  buildDependencyGraph,
  getFileDependencies,
  getIsolatedFiles,
  detectCycles,
  fileNodeId,
  packageNodeId,
} = require('../../src/analyzers/dependencyGraph');

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal RepositoryAnalysis from a simple descriptor.
 *
 * files: Array of { path, imports: [{ source, cjs?: bool, names?: string[] }] }
 */
function makeAnalysis(files) {
  return {
    files: files.map(f => ({
      filePath: f.path,
      symbols: (f.imports || []).map(imp => ({
        kind: 'import',
        source: imp.source,
        location: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 30 },
        specifiers: imp.names
          ? imp.names.map(n => ({ name: n, alias: null, type: imp.cjs ? 'cjs-named' : 'named' }))
          : [{ name: imp.source, alias: null, type: imp.cjs ? 'cjs-default' : 'default' }],
      })),
    })),
  };
}

// ── fileNodeId / packageNodeId ────────────────────────────────────────────────

describe('node ID helpers', () => {
  test('fileNodeId prefixes with file:', () => {
    expect(fileNodeId('src/app.js')).toBe('file:src/app.js');
  });

  test('packageNodeId prefixes with pkg:', () => {
    expect(packageNodeId('express')).toBe('pkg:express');
  });
});

// ── buildDependencyGraph — nodes ──────────────────────────────────────────────

describe('buildDependencyGraph — nodes', () => {
  test('every file in analysis becomes a file node', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js',    imports: [] },
      { path: 'src/utils.js',  imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const fileNodes = graph.nodes.filter(n => n.type === 'file');
    expect(fileNodes).toHaveLength(2);
    expect(fileNodes.map(n => n.filePath).sort()).toEqual(['src/app.js', 'src/utils.js']);
  });

  test('external packages become package nodes', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express' }] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const pkgNodes = graph.nodes.filter(n => n.type === 'package');
    expect(pkgNodes).toHaveLength(1);
    expect(pkgNodes[0].name).toBe('express');
    expect(pkgNodes[0].id).toBe('pkg:express');
  });

  test('external package node has name field', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'mongoose' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const pkg = graph.nodes.find(n => n.type === 'package');
    expect(pkg).toMatchObject({ id: 'pkg:mongoose', type: 'package', name: 'mongoose' });
  });

  test('internal file node has filePath field', () => {
    const analysis = makeAnalysis([{ path: 'src/index.js', imports: [] }]);
    const graph = buildDependencyGraph(analysis);
    const node = graph.nodes.find(n => n.type === 'file');
    expect(node).toMatchObject({ id: 'file:src/index.js', type: 'file', filePath: 'src/index.js' });
  });

  test('nodes are sorted deterministically', () => {
    const analysis = makeAnalysis([
      { path: 'src/zzz.js', imports: [] },
      { path: 'src/aaa.js', imports: [] },
    ]);
    const g1 = buildDependencyGraph(analysis);
    const g2 = buildDependencyGraph(analysis);
    expect(g1.nodes.map(n => n.id)).toEqual(g2.nodes.map(n => n.id));
    // 'file:src/aaa.js' < 'file:src/zzz.js'
    expect(g1.nodes[0].id).toBe('file:src/aaa.js');
  });

  test('no duplicate package nodes for same package imported multiple times', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: 'express' }] },
      { path: 'src/b.js', imports: [{ source: 'express' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const pkgNodes = graph.nodes.filter(n => n.type === 'package');
    expect(pkgNodes).toHaveLength(1);
  });
});

// ── buildDependencyGraph — edges ──────────────────────────────────────────────

describe('buildDependencyGraph — edges', () => {
  test('internal import creates an edge with type=imports', () => {
    const analysis = makeAnalysis([
      { path: 'src/index.js', imports: [{ source: './utils' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const edge = graph.edges.find(
      e => e.source === 'file:src/index.js' && e.target === 'file:src/utils.js'
    );
    expect(edge).toBeDefined();
    expect(edge.type).toBe('imports');
  });

  test('external package import creates an edge pointing to package node', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express' }] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const edge = graph.edges.find(
      e => e.source === 'file:src/app.js' && e.target === 'pkg:express'
    );
    expect(edge).toBeDefined();
  });

  test('CJS require creates an edge with type=requires', () => {
    const analysis = makeAnalysis([
      { path: 'src/server.js', imports: [{ source: './db', cjs: true }] },
      { path: 'src/db.js',     imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const edge = graph.edges.find(
      e => e.source === 'file:src/server.js' && e.target === 'file:src/db.js'
    );
    expect(edge).toBeDefined();
    expect(edge.type).toBe('requires');
  });

  test('edges are sorted deterministically', () => {
    const analysis = makeAnalysis([
      { path: 'src/b.js', imports: [{ source: 'express' }] },
      { path: 'src/a.js', imports: [{ source: 'express' }] },
    ]);
    const g1 = buildDependencyGraph(analysis);
    const g2 = buildDependencyGraph(analysis);
    const ids1 = g1.edges.map(e => `${e.source}|${e.target}`);
    const ids2 = g2.edges.map(e => `${e.source}|${e.target}`);
    expect(ids1).toEqual(ids2);
  });

  test('no duplicate edges for same source→target', () => {
    // Same specifier appears twice in symbols
    const analysis = {
      files: [{
        filePath: 'src/app.js',
        symbols: [
          { kind: 'import', source: './utils', specifiers: [{ name: 'a', alias: null, type: 'named' }], location: null },
          { kind: 'import', source: './utils', specifiers: [{ name: 'b', alias: null, type: 'named' }], location: null },
        ],
      }, {
        filePath: 'src/utils.js',
        symbols: [],
      }],
    };
    const graph = buildDependencyGraph(analysis);
    const edges = graph.edges.filter(
      e => e.source === 'file:src/app.js' && e.target === 'file:src/utils.js'
    );
    expect(edges).toHaveLength(1);
  });

  test('edge evidence contains specifier', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: './utils' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges[0];
    expect(edge.evidence).toBeDefined();
    expect(edge.evidence.specifier).toBe('./utils');
  });

  test('edge evidence contains importedNames', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express', names: ['Router', 'json'] }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges[0];
    expect(edge.evidence.importedNames).toEqual(expect.arrayContaining(['Router', 'json']));
  });

  test('unresolved imports are NOT added as edges', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: './doesNotExist' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    // No target file for ./doesNotExist → unresolved → no edge
    expect(graph.edges).toHaveLength(0);
  });
});

// ── buildDependencyGraph — meta ───────────────────────────────────────────────

describe('buildDependencyGraph — meta', () => {
  test('meta.totalFiles matches file node count', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [] },
      { path: 'src/b.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.meta.totalFiles).toBe(2);
  });

  test('meta.totalPackages matches package node count', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express' }, { source: 'mongoose' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.meta.totalPackages).toBe(2);
  });

  test('meta.totalEdges matches edge count', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: './utils' }, { source: 'express' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.meta.totalEdges).toBe(graph.edges.length);
  });

  test('meta.unresolvedImports counts unresolved', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: './ghost' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.meta.unresolvedImports).toBe(1);
  });

  test('meta.builtAt is an ISO string', () => {
    const analysis = makeAnalysis([{ path: 'src/app.js', imports: [] }]);
    const graph = buildDependencyGraph(analysis);
    expect(() => new Date(graph.meta.builtAt)).not.toThrow();
    expect(graph.meta.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('empty repository produces zero meta counts', () => {
    const analysis = makeAnalysis([]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.meta.totalFiles).toBe(0);
    expect(graph.meta.totalPackages).toBe(0);
    expect(graph.meta.totalEdges).toBe(0);
  });
});

// ── Internal vs external ──────────────────────────────────────────────────────

describe('buildDependencyGraph — internal vs external', () => {
  test('relative imports resolve to internal file nodes', () => {
    const analysis = makeAnalysis([
      { path: 'src/controllers/auth.js', imports: [{ source: '../services/authService' }] },
      { path: 'src/services/authService.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges[0];
    expect(edge.target).toBe('file:src/services/authService.js');
    expect(graph.nodes.find(n => n.id === edge.target)?.type).toBe('file');
  });

  test('bare package names resolve to external package nodes', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'jsonwebtoken' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const edge = graph.edges[0];
    expect(edge.target).toBe('pkg:jsonwebtoken');
    expect(graph.nodes.find(n => n.id === edge.target)?.type).toBe('package');
  });

  test('@org/pkg is treated as external', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: '@babel/core' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.nodes.find(n => n.id === 'pkg:@babel/core')).toBeDefined();
  });

  test('mixed internal + external in same file', () => {
    const analysis = makeAnalysis([
      {
        path: 'src/services/authService.js',
        imports: [
          { source: '../models/User' },
          { source: 'jsonwebtoken' },
          { source: 'bcrypt' },
        ],
      },
      { path: 'src/models/User.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const internalEdges = graph.edges.filter(e => e.target.startsWith('file:'));
    const externalEdges = graph.edges.filter(e => e.target.startsWith('pkg:'));

    expect(internalEdges).toHaveLength(1);
    expect(externalEdges).toHaveLength(2);
  });
});

// ── Circular dependencies ─────────────────────────────────────────────────────

describe('buildDependencyGraph — circular dependencies', () => {
  test('A→B→A does not crash', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './a' }] },
    ]);
    expect(() => buildDependencyGraph(analysis)).not.toThrow();
  });

  test('circular dependency produces two edges', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './a' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    expect(graph.edges).toHaveLength(2);

    const aToB = graph.edges.find(e => e.source === 'file:src/a.js' && e.target === 'file:src/b.js');
    const bToA = graph.edges.find(e => e.source === 'file:src/b.js' && e.target === 'file:src/a.js');
    expect(aToB).toBeDefined();
    expect(bToA).toBeDefined();
  });

  test('three-way cycle A→B→C→A does not crash', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './c' }] },
      { path: 'src/c.js', imports: [{ source: './a' }] },
    ]);
    expect(() => buildDependencyGraph(analysis)).not.toThrow();
    const graph = buildDependencyGraph(analysis);
    expect(graph.edges).toHaveLength(3);
  });
});

// ── getFileDependencies ───────────────────────────────────────────────────────

describe('getFileDependencies', () => {
  test('returns direct dependencies for a file', () => {
    const analysis = makeAnalysis([
      { path: 'src/index.js', imports: [{ source: './utils' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const info  = getFileDependencies(graph, 'src/index.js');

    expect(info.filePath).toBe('src/index.js');
    expect(info.dependencies).toHaveLength(1);
    expect(info.dependencies[0].filePath).toBe('src/utils.js');
    expect(info.dependencyCount).toBe(1);
  });

  test('returns dependents of a file', () => {
    const analysis = makeAnalysis([
      { path: 'src/index.js', imports: [{ source: './utils' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const info  = getFileDependencies(graph, 'src/utils.js');

    expect(info.dependents).toHaveLength(1);
    expect(info.dependents[0].filePath).toBe('src/index.js');
    expect(info.dependentCount).toBe(1);
  });

  test('returns externalPackages', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express' }, { source: 'mongoose' }] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const info  = getFileDependencies(graph, 'src/app.js');

    expect(info.externalPackages.sort()).toEqual(['express', 'mongoose']);
  });

  test('file with no edges returns empty arrays', () => {
    const analysis = makeAnalysis([
      { path: 'src/isolated.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const info  = getFileDependencies(graph, 'src/isolated.js');

    expect(info.dependencies).toHaveLength(0);
    expect(info.dependents).toHaveLength(0);
    expect(info.externalPackages).toHaveLength(0);
    expect(info.dependencyCount).toBe(0);
    expect(info.dependentCount).toBe(0);
  });

  test('works correctly with circular dependency', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './a' }] },
    ]);
    const graph = buildDependencyGraph(analysis);

    const infoA = getFileDependencies(graph, 'src/a.js');
    expect(infoA.dependencies[0].filePath).toBe('src/b.js');
    expect(infoA.dependents[0].filePath).toBe('src/b.js');

    const infoB = getFileDependencies(graph, 'src/b.js');
    expect(infoB.dependencies[0].filePath).toBe('src/a.js');
    expect(infoB.dependents[0].filePath).toBe('src/a.js');
  });

  test('both internal and external deps are listed in dependencies array', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: './utils' }, { source: 'express' }] },
      { path: 'src/utils.js', imports: [] },
    ]);
    const graph = buildDependencyGraph(analysis);
    const info  = getFileDependencies(graph, 'src/app.js');

    expect(info.dependencies).toHaveLength(2);
    const hasInternal = info.dependencies.some(d => d.filePath === 'src/utils.js');
    const hasExternal = info.dependencies.some(d => d.package === 'express');
    expect(hasInternal).toBe(true);
    expect(hasExternal).toBe(true);
  });
});

// ── getIsolatedFiles ──────────────────────────────────────────────────────────

describe('getIsolatedFiles', () => {
  test('returns files with no edges', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [] },
      { path: 'src/lonely.js', imports: [] },
    ]);
    const graph    = buildDependencyGraph(analysis);
    const isolated = getIsolatedFiles(graph);

    expect(isolated).toContain('src/lonely.js');
    expect(isolated).not.toContain('src/a.js');
    expect(isolated).not.toContain('src/b.js');
  });

  test('returns empty array when all files are connected', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [] },
    ]);
    const graph    = buildDependencyGraph(analysis);
    const isolated = getIsolatedFiles(graph);

    expect(isolated).toHaveLength(0);
  });

  test('all files isolated in empty repo', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [] },
      { path: 'src/b.js', imports: [] },
    ]);
    const graph    = buildDependencyGraph(analysis);
    const isolated = getIsolatedFiles(graph);

    expect(isolated.sort()).toEqual(['src/a.js', 'src/b.js']);
  });

  test('isolated list is sorted', () => {
    const analysis = makeAnalysis([
      { path: 'src/z.js', imports: [] },
      { path: 'src/a.js', imports: [] },
    ]);
    const graph    = buildDependencyGraph(analysis);
    const isolated = getIsolatedFiles(graph);

    expect(isolated).toEqual(['src/a.js', 'src/z.js']);
  });

  test('package nodes are not included in isolated files', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js', imports: [{ source: 'express' }] },
    ]);
    const graph    = buildDependencyGraph(analysis);
    const isolated = getIsolatedFiles(graph);

    // express is a package node, not a file node → not in isolated
    expect(isolated).not.toContain('express');
  });
});

// ── detectCycles ──────────────────────────────────────────────────────────────

describe('detectCycles', () => {
  test('returns empty array when no cycles exist', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './c' }] },
      { path: 'src/c.js', imports: [] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    const cycles = detectCycles(graph);
    expect(cycles).toHaveLength(0);
  });

  test('detects a two-node cycle A→B→A', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './a' }] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    const cycles = detectCycles(graph);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // Each cycle entry is an array of file paths
    expect(Array.isArray(cycles[0])).toBe(true);
  });

  test('cycle contains file paths (not node IDs)', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './a' }] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    const cycles = detectCycles(graph);
    // Should contain actual file paths
    const allPaths = cycles.flat();
    expect(allPaths.every(p => !p.startsWith('file:'))).toBe(true);
    expect(allPaths.some(p => p === 'src/a.js' || p === 'src/b.js')).toBe(true);
  });

  test('three-node cycle is detected', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: './b' }] },
      { path: 'src/b.js', imports: [{ source: './c' }] },
      { path: 'src/c.js', imports: [{ source: './a' }] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    const cycles = detectCycles(graph);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  test('external package edges do not participate in cycle detection', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [{ source: 'express' }] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    // express → src/a.js edge doesn't exist, so no cycle
    const cycles = detectCycles(graph);
    expect(cycles).toHaveLength(0);
  });

  test('does not crash on empty graph', () => {
    const analysis = makeAnalysis([]);
    const graph  = buildDependencyGraph(analysis);
    expect(() => detectCycles(graph)).not.toThrow();
  });

  test('does not crash on isolated files', () => {
    const analysis = makeAnalysis([
      { path: 'src/a.js', imports: [] },
      { path: 'src/b.js', imports: [] },
    ]);
    const graph  = buildDependencyGraph(analysis);
    const cycles = detectCycles(graph);
    expect(cycles).toHaveLength(0);
  });
});

// ── Large / realistic scenario ────────────────────────────────────────────────

describe('buildDependencyGraph — realistic scenario', () => {
  test('Express-like project structure', () => {
    const analysis = makeAnalysis([
      {
        path: 'src/app.js',
        imports: [
          { source: 'express' },
          { source: './routes/auth' },
          { source: './routes/user' },
          { source: './middleware/errorHandler' },
        ],
      },
      {
        path: 'src/routes/auth.js',
        imports: [
          { source: 'express' },
          { source: '../controllers/authController' },
        ],
      },
      {
        path: 'src/routes/user.js',
        imports: [
          { source: 'express' },
          { source: '../controllers/userController' },
        ],
      },
      {
        path: 'src/controllers/authController.js',
        imports: [
          { source: '../services/authService' },
          { source: 'jsonwebtoken' },
        ],
      },
      {
        path: 'src/controllers/userController.js',
        imports: [
          { source: '../services/userService' },
        ],
      },
      {
        path: 'src/services/authService.js',
        imports: [
          { source: '../models/User' },
          { source: 'bcrypt' },
          { source: 'jsonwebtoken' },
        ],
      },
      {
        path: 'src/services/userService.js',
        imports: [
          { source: '../models/User' },
        ],
      },
      {
        path: 'src/models/User.js',
        imports: [
          { source: 'mongoose' },
        ],
      },
      { path: 'src/middleware/errorHandler.js', imports: [] },
    ]);

    const graph = buildDependencyGraph(analysis);

    // File nodes: 9
    expect(graph.meta.totalFiles).toBe(9);
    // Package nodes: express, jsonwebtoken, bcrypt, mongoose = 4
    expect(graph.meta.totalPackages).toBe(4);
    // No cycles in this structure
    expect(detectCycles(graph)).toHaveLength(0);
    // src/middleware/errorHandler.js has no outgoing deps
    const ehInfo = getFileDependencies(graph, 'src/middleware/errorHandler.js');
    expect(ehInfo.dependencyCount).toBe(0);
    expect(ehInfo.dependentCount).toBe(1); // imported by app.js
    // src/models/User.js is imported by both services
    const userInfo = getFileDependencies(graph, 'src/models/User.js');
    expect(userInfo.dependentCount).toBe(2);
  });
});
