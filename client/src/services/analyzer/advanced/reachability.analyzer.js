/**
 * reachability.analyzer.js
 *
 * It receives the dependency graph, then extracts entry point edges,
 * and then it applies a Breadth-First Search to isolate dead code.
 */

/**
 * It checks the file path string, then extracts standard application roots,
 * and then it applies a boolean evaluation to confirm entry points.
 */
function isEntryPoint(filePath) {
  const normalized = filePath.toLowerCase();

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
    normalized.endsWith('main.rs') ||
    normalized.endsWith('application.java')
  ) {
    return true;
  }

  return false;
}

/**
 * It evaluates the dependency graph, then extracts unvisited nodes via BFS,
 * and then it applies the results to return unreachable file paths.
 */
function analyzeReachability(graph) {
  if (!graph || !graph.nodes || !graph.edges) {
    return { unreachableFiles: [], entryPoints: [] };
  }

  const nodeIds = Array.isArray(graph.nodes) ? graph.nodes.map(n => n.id) : Object.keys(graph.nodes);

  // It filters graph nodes, then extracts those lacking incoming edges, and then it applies them to the entry point list.
  const entryPoints = nodeIds.filter(id => {
    const rawPath = id.replace(/^file:/, '');
    if (isEntryPoint(rawPath)) return true;

    const inDegree = graph.edges.filter(e => e.target === id).length;
    const outDegree = graph.edges.filter(e => e.source === id).length;
    return inDegree === 0 && outDegree > 0;
  });

  const visited = new Set(entryPoints);
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift();

    const outgoing = graph.edges.filter(e => e.source === current);

    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  // It compares the full node list to visited nodes, then extracts the diff, and then it applies it to the dead code array.
  const unreachableFiles = nodeIds.filter(id => !visited.has(id));

  return {
    unreachableFiles,
    entryPoints,
  };
}

export { analyzeReachability, isEntryPoint };
