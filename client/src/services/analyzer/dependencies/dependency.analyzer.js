/**
 * dependencyGraph.js
 *
 * It ingests the resolved AST imports, then extracts the dependencies,
 * and then it applies the canonical AnalysisGraph schema for React Flow rendering.
 *
 * How this file is structured:
 *   1. buildDependencyGraph() — It triggers module resolution, then extracts nodes/edges, and then it applies the deterministic React Flow schema.
 *   2. getFileDependencies()  — It filters the edge array, then extracts a specific file's connections, and then it applies the focused subset.
 *   3. detectCycles()         — It maps adjacency lists, then extracts backward references, and then it applies DFS to detect cyclic dependencies.
 */

import { resolveAllImports, buildKnownFilesSet } from './module.resolver.js';
import { createAnalysisNode, createAnalysisEdge } from '../parsing/symbols.js';

// ── Node/edge ID helpers ──────────────────────────────────────────────────────

export function fileNodeId(filePath) {
  return `file:${filePath}`;
}

export function packageNodeId(name) {
  return `pkg:${name}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * It resolves all repository imports, then extracts React Flow compatible nodes and edges,
 * and then it applies deterministic sorting to guarantee stable graph UI rendering.
 */
export function buildDependencyGraph(analysis) {
  const knownFiles = buildKnownFilesSet(analysis);
  const resolvedMap = resolveAllImports(analysis, knownFiles);

  const nodesMap = new Map(); // id → AnalysisNode
  const edgesMap = new Map(); // edgeKey → AnalysisEdge

  // It iterates over every file, then extracts its path, and then it applies the AnalysisNode schema.
  for (const f of analysis.files) {
    const id = fileNodeId(f.filePath);
    nodesMap.set(
      id,
      createAnalysisNode({
        id,
        type: 'fileNode',
        label: f.filePath.split('/').pop(),
        filePath: f.filePath,
      })
    );
  }

  let unresolvedCount = 0;

  // It maps over resolved files, then extracts individual targets, and then it applies the AnalysisEdge schema.
  for (const [filePath, imports] of resolvedMap) {
    const sourceId = fileNodeId(filePath);

    for (const ri of imports) {
      if (ri.kind === 'unresolved') {
        unresolvedCount++;
        continue;
      }

      let targetId;

      if (ri.kind === 'external') {
        targetId = packageNodeId(ri.specifier);
        if (!nodesMap.has(targetId)) {
          nodesMap.set(
            targetId,
            createAnalysisNode({
              id: targetId,
              type: 'moduleNode',
              label: ri.specifier,
            })
          );
        }
      } else {
        targetId = fileNodeId(ri.resolvedTo);
      }

      const isCjs = ri.specifiers && ri.specifiers.some(s => s.type === 'cjs-default' || s.type === 'cjs-named');

      const edgeKey = `${sourceId}|${targetId}`;

      if (!edgesMap.has(edgeKey)) {
        edgesMap.set(
          edgeKey,
          createAnalysisEdge({
            id: edgeKey,
            source: sourceId,
            target: targetId,
            type: isCjs ? 'smoothstep' : 'default',
            importCount: 1,
            specifiers: _extractNames(ri.specifiers),
          })
        );
      } else {
        // Increment weight for multiple imports of the same target
        const existingEdge = edgesMap.get(edgeKey);
        existingEdge.data.importCount += 1;
        existingEdge.data.specifiers.push(..._extractNames(ri.specifiers));
      }
    }
  }

  // Deterministic Sorting
  const nodes = Array.from(nodesMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const edges = Array.from(edgesMap.values()).sort((a, b) => {
    const cmp = a.source.localeCompare(b.source);
    return cmp !== 0 ? cmp : a.target.localeCompare(b.target);
  });

  const fileNodes = nodes.filter(n => n.type === 'fileNode');
  const packageNodes = nodes.filter(n => n.type === 'moduleNode');

  // Compute In/Out degrees for graph metrics
  edges.forEach(edge => {
    const src = nodesMap.get(edge.source);
    const tgt = nodesMap.get(edge.target);
    if (src) src.data.metrics.outDegree += 1;
    if (tgt) tgt.data.metrics.inDegree += 1;
  });

  return {
    nodes,
    edges,
    meta: {
      totalFiles: fileNodes.length,
      totalPackages: packageNodes.length,
      totalEdges: edges.length,
      unresolvedImports: unresolvedCount,
      builtAt: new Date().toISOString(),
    },
  };
}

// ── Derived queries ───────────────────────────────────────────────────────────

/**
 * It searches the full graph edge array, then extracts matching source/target connections,
 * and then it applies them into structured incoming and outgoing lists.
 */
export function getFileDependencies(graph, filePath) {
  const sourceId = fileNodeId(filePath);

  const dependencies = [];
  const dependents = [];
  const externalPkgs = new Set();

  for (const edge of graph.edges) {
    if (edge.source === sourceId) {
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (!targetNode) continue;

      if (targetNode.type === 'fileNode') {
        dependencies.push({
          filePath: targetNode.data.filePath,
          evidence: edge.data,
        });
      } else if (targetNode.type === 'moduleNode') {
        externalPkgs.add(targetNode.data.label);
        dependencies.push({
          package: targetNode.data.label,
          evidence: edge.data,
        });
      }
    }

    if (edge.target === sourceId) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.type === 'fileNode') {
        dependents.push({
          filePath: sourceNode.data.filePath,
          evidence: edge.data,
        });
      }
    }
  }

  return {
    filePath,
    dependencies,
    dependents,
    externalPackages: Array.from(externalPkgs).sort(),
    dependencyCount: dependencies.length,
    dependentCount: dependents.length,
  };
}

/**
 * It iterates the edges to find connected ids, then extracts the disconnected nodes,
 * and then it applies them to the isolated files array.
 */
export function getIsolatedFiles(graph) {
  const connected = new Set();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return graph.nodes
    .filter(n => n.type === 'fileNode' && !connected.has(n.id))
    .map(n => n.data.filePath)
    .sort();
}

/**
 * It builds an adjacency list, then extracts recursion paths,
 * and then it applies Depth First Search (DFS) to identify circular edges.
 */
export function detectCycles(graph) {
  const adj = new Map();
  for (const node of graph.nodes) {
    if (node.type === 'fileNode') adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source).push(edge.target);
  }

  const visited = new Set();
  const inStack = new Set();
  const cycles = [];

  for (const startId of adj.keys()) {
    if (visited.has(startId)) continue;
    _dfsCycles(startId, adj, visited, inStack, [], cycles);
  }

  return cycles.map(cycle =>
    cycle.map(id => {
      const node = graph.nodes.find(n => n.id === id);
      return node ? node.data.filePath : id;
    })
  );
}

function _dfsCycles(nodeId, adj, visited, inStack, path, cycles) {
  visited.add(nodeId);
  inStack.add(nodeId);
  path.push(nodeId);

  for (const neighbour of adj.get(nodeId) || []) {
    if (!visited.has(neighbour)) {
      _dfsCycles(neighbour, adj, visited, inStack, path, cycles);
    } else if (inStack.has(neighbour)) {
      const cycleStart = path.indexOf(neighbour);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(neighbour));
      }
    }
  }

  path.pop();
  inStack.delete(nodeId);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * It filters side-effect specifiers, then extracts the valid aliases,
 * and then it applies them to the output name array.
 */
function _extractNames(specifiers) {
  if (!specifiers || !specifiers.length) return [];
  return specifiers
    .filter(s => s.type !== 'side-effect')
    .map(s => s.alias || s.name)
    .filter(Boolean);
}
