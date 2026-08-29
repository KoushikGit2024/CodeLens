/**
 * dependencyGraph.js
 *
 * Builds a deterministic, serialisable dependency graph from a RepositoryAnalysis.
 *
 * ── Graph model ──────────────────────────────────────────────────────────────
 *
 * Nodes:
 *   { id, type: 'file',     filePath }
 *   { id, type: 'package',  name }
 *
 * Edges:
 *   {
 *     source:   string  — id of the source node (file that imports)
 *     target:   string  — id of the target node (file or package imported)
 *     type:     'imports' | 'requires' | 'depends_on'
 *     evidence: {
 *       specifier:   string             — raw import/require string
 *       importedNames: string[]         — bound names, e.g. ['Router', 'json']
 *       location:    Location | null    — source location from AST
 *     }
 *   }
 *
 * Edge type semantics:
 *   'imports'    — ES module import statement
 *   'requires'   — CommonJS require() call
 *   'depends_on' — aggregated edge (one per unique source→target pair)
 *
 * ── Cycle safety ─────────────────────────────────────────────────────────────
 *   Circular dependencies are represented faithfully in the graph.
 *   No DFS/traversal is needed to build the graph itself, so cycles cannot
 *   cause infinite loops.  Cycle detection is provided as a derived query.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 *   Nodes and edges are sorted before being frozen into the output object.
 *   Given the same RepositoryAnalysis the output is always identical.
 */

'use strict';

const { resolveAllImports, buildKnownFilesSet } = require('./moduleResolver');

// ── Node/edge ID helpers ──────────────────────────────────────────────────────

/** Stable node ID for an internal file. */
function fileNodeId(filePath) {
  return `file:${filePath}`;
}

/** Stable node ID for an external package. */
function packageNodeId(name) {
  return `pkg:${name}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the dependency graph for an entire repository.
 *
 * @param {object} analysis   — RepositoryAnalysis from repositoryAnalyzer
 * @returns {DependencyGraph}
 *
 * DependencyGraph shape:
 * {
 *   nodes:  Node[]
 *   edges:  Edge[]
 *   meta: {
 *     totalFiles:         number
 *     totalPackages:      number
 *     totalEdges:         number
 *     unresolvedImports:  number
 *     builtAt:            string (ISO)
 *   }
 * }
 */
function buildDependencyGraph(analysis) {
  const knownFiles = buildKnownFilesSet(analysis);
  const resolvedMap = resolveAllImports(analysis, knownFiles);

  // ── Collect nodes ────────────────────────────────────────────────────────────
  const nodesMap = new Map(); // id → Node

  // Every file in the analysis becomes a file node
  for (const f of analysis.files) {
    const id = fileNodeId(f.filePath);
    nodesMap.set(id, { id, type: 'file', filePath: f.filePath });
  }

  // ── Collect edges ─────────────────────────────────────────────────────────
  // Use a Map keyed by "sourceId|targetId" to deduplicate; keep all evidence
  const edgesMap = new Map(); // edgeKey → Edge

  let unresolvedCount = 0;

  for (const [filePath, imports] of resolvedMap) {
    const sourceId = fileNodeId(filePath);

    for (const ri of imports) {
      if (ri.kind === 'unresolved') {
        unresolvedCount++;
        continue; // skip — not fabricated
      }

      let targetId;

      if (ri.kind === 'external') {
        targetId = packageNodeId(ri.specifier);
        if (!nodesMap.has(targetId)) {
          nodesMap.set(targetId, { id: targetId, type: 'package', name: ri.specifier });
        }
      } else {
        // internal
        targetId = fileNodeId(ri.resolvedTo);
      }

      // Determine edge type from specifier types in the import symbol
      const isCjs = ri.specifiers && ri.specifiers.some(
        s => s.type === 'cjs-default' || s.type === 'cjs-named'
      );
      const edgeType = isCjs ? 'requires' : 'imports';

      // Deduplicate on source+target; accumulate evidence per edge
      const edgeKey = `${sourceId}|${targetId}`;

      if (!edgesMap.has(edgeKey)) {
        edgesMap.set(edgeKey, {
          source: sourceId,
          target: targetId,
          type:   edgeType,
          evidence: {
            specifier:     ri.specifier,
            importedNames: _extractNames(ri.specifiers),
            location:      ri.location || null,
          },
        });
      }
      // If duplicate edge (e.g. file imported twice), keep first evidence only.
      // The edge type stays as-is (first occurrence wins).
    }
  }

  const nodes = Array.from(nodesMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  const edges = Array.from(edgesMap.values()).sort((a, b) => {
    const cmp = a.source.localeCompare(b.source);
    return cmp !== 0 ? cmp : a.target.localeCompare(b.target);
  });

  const fileNodes    = nodes.filter(n => n.type === 'file');
  const packageNodes = nodes.filter(n => n.type === 'package');

  return {
    nodes,
    edges,
    meta: {
      totalFiles:        fileNodes.length,
      totalPackages:     packageNodes.length,
      totalEdges:        edges.length,
      unresolvedImports: unresolvedCount,
      builtAt:           new Date().toISOString(),
    },
  };
}

// ── Derived queries ───────────────────────────────────────────────────────────

/**
 * Return direct dependencies of a file (what it imports).
 *
 * @param {object}      graph     — DependencyGraph
 * @param {string}      filePath  — relative file path
 * @returns {FileDependencies}
 *
 * {
 *   filePath:      string
 *   dependencies:  DependencyEntry[]   — files/packages this file imports
 *   dependents:    DependencyEntry[]   — files that import this file
 *   externalPackages: string[]         — external package names imported
 *   dependencyCount:  number
 *   dependentCount:   number
 * }
 */
function getFileDependencies(graph, filePath) {
  const sourceId = fileNodeId(filePath);

  const dependencies  = [];
  const dependents    = [];
  const externalPkgs  = new Set();

  for (const edge of graph.edges) {
    if (edge.source === sourceId) {
      const targetNode = graph.nodes.find(n => n.id === edge.target);
      if (!targetNode) continue;

      if (targetNode.type === 'file') {
        dependencies.push({
          filePath:  targetNode.filePath,
          edgeType:  edge.type,
          evidence:  edge.evidence,
        });
      } else if (targetNode.type === 'package') {
        externalPkgs.add(targetNode.name);
        dependencies.push({
          package:  targetNode.name,
          edgeType: edge.type,
          evidence: edge.evidence,
        });
      }
    }

    if (edge.target === sourceId) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.type === 'file') {
        dependents.push({
          filePath: sourceNode.filePath,
          edgeType: edge.type,
          evidence: edge.evidence,
        });
      }
    }
  }

  return {
    filePath,
    dependencies,
    dependents,
    externalPackages:  Array.from(externalPkgs).sort(),
    dependencyCount:   dependencies.length,
    dependentCount:    dependents.length,
  };
}

/**
 * Return all files that have no edges (neither imports nor is imported).
 *
 * @param {object} graph
 * @returns {string[]} file paths
 */
function getIsolatedFiles(graph) {
  const connected = new Set();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return graph.nodes
    .filter(n => n.type === 'file' && !connected.has(n.id))
    .map(n => n.filePath)
    .sort();
}

/**
 * Detect cycles in the dependency graph using iterative DFS.
 * Only considers file→file edges (ignores external packages).
 *
 * @param {object} graph
 * @returns {string[][]}  — array of cycle paths (each path is an array of filePaths)
 */
function detectCycles(graph) {
  // Build adjacency list (file id → file id[])
  const adj = new Map();
  for (const node of graph.nodes) {
    if (node.type === 'file') adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source).push(edge.target);
  }

  const visited   = new Set();
  const inStack   = new Set();
  const cycles    = [];

  for (const startId of adj.keys()) {
    if (visited.has(startId)) continue;
    _dfsCycles(startId, adj, visited, inStack, [], cycles);
  }

  // Convert node IDs back to file paths
  return cycles.map(cycle =>
    cycle.map(id => {
      const node = graph.nodes.find(n => n.id === id);
      return node ? node.filePath : id;
    })
  );
}

function _dfsCycles(nodeId, adj, visited, inStack, path, cycles) {
  visited.add(nodeId);
  inStack.add(nodeId);
  path.push(nodeId);

  for (const neighbour of (adj.get(nodeId) || [])) {
    if (!visited.has(neighbour)) {
      _dfsCycles(neighbour, adj, visited, inStack, path, cycles);
    } else if (inStack.has(neighbour)) {
      // Found a cycle — record the cycle path from neighbour onward
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

function _extractNames(specifiers) {
  if (!specifiers || !specifiers.length) return [];
  return specifiers
    .filter(s => s.type !== 'side-effect')
    .map(s => s.alias || s.name)
    .filter(Boolean);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  buildDependencyGraph,
  getFileDependencies,
  getIsolatedFiles,
  detectCycles,
  fileNodeId,
  packageNodeId,
};
