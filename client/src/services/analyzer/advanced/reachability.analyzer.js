'use strict';

/**
 * reachability.analyzer.js
 *
 * Performs reachability analysis on the dependency graph to find dead (unused) code.
 * Starting from a set of known entry points (e.g., index.js, App.jsx, main.go),
 * this analyzer performs a Breadth-First Search (BFS) forward through the directed
 * dependency edges.
 *
 * Any node (file) that is not visited is considered unreachable (Dead Code).
 */


/**
 * Heuristics to identify entry points of a project.
 */
function isEntryPoint(filePath) {
  const normalized = filePath.toLowerCase();
  
  // Common entry points
  if (
    normalized.endsWith('index.js') || 
    normalized.endsWith('index.ts') || 
    normalized.endsWith('index.jsx') || 
    normalized.endsWith('index.tsx') ||
    normalized.endsWith('main.js') ||
    normalized.endsWith('main.ts') ||
    normalized.endsWith('app.jsx') ||
    normalized.endsWith('app.tsx') ||
    normalized.endsWith('main.go') ||
    normalized.endsWith('application.java')
  ) {
    return true;
  }
  
  return false;
}

/**
 * Finds all unreachable files in the dependency graph.
 *
 * @param {object} graph - The file-level dependency graph (nodes and edges)
 * @returns {object} { unreachableFiles: string[], entryPoints: string[] }
 */
function analyzeReachability(graph) {
  if (!graph || !graph.nodes || !graph.edges) {
    return { unreachableFiles: [], entryPoints: [] };
  }

  const nodeIds = Object.keys(graph.nodes);
  
  // 1. Identify Entry Points
  const entryPoints = nodeIds.filter(id => {
    // Remove "file:" prefix if present
    const rawPath = id.replace(/^file:/, '');
    if (isEntryPoint(rawPath)) return true;
    
    const inDegree = graph.edges.filter(e => e.target === id).length;
    const outDegree = graph.edges.filter(e => e.source === id).length;
    // A file with out edges but no in edges is practically an entry point
    return inDegree === 0 && outDegree > 0;
  });

  // 2. Perform BFS to find all reachable nodes
  const visited = new Set(entryPoints);
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift();
    
    // Find all outgoing edges from 'current'
    const outgoing = graph.edges.filter(e => e.source === current);
    
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  // 3. Find Unreachable nodes
  const unreachableFiles = nodeIds.filter(id => !visited.has(id));

  return {
    unreachableFiles,
    entryPoints
  };
}

export { analyzeReachability, isEntryPoint };
