/**
 * architecture.analyzer.js
 * 
 * Implements architecture intelligence. Groups files into logical components,
 * identifies layers, detects entry points, and surfaces API boundaries.
 */

import { validateArchitecture } from './architecture.rules.js';

// ── Heuristics Configuration ──────────────────────────────────────────────────

const LAYER_MAPPING = [
  { layer: 'Presentation', patterns: [/\.jsx$/, /\.tsx$/, /\/components\//, /\/pages\//, /\/views\//, /\/ui\//] },
  { layer: 'API',          patterns: [/\/controllers\//, /\/routes\//, /\/api\//, /Controller\.js$/] },
  { layer: 'Service',      patterns: [/\/services\//, /Service\.js$/, /\/core\//] },
  { layer: 'Data',         patterns: [/\/models\//, /\/repositories\//, /\/db\//, /Model\.js$/] },
];

const ENTRY_POINT_NAMES = new Set([
  'server.js', 'app.js', 'index.js', 'main.js', 'main.jsx', 'index.jsx',
  'src/server.js', 'src/app.js', 'src/index.js', 'src/main.js', 'src/main.jsx', 'src/index.jsx', 'src/index.tsx', 'src/main.tsx'
]);

// ── Dependency Helpers (Ported from dependency.analyzer) ──────────────────────

function getIsolatedFiles(graph) {
  const connected = new Set();
  for (const edge of graph.edges) {
    if (edge.source.startsWith('file:')) connected.add(edge.source);
    if (edge.target.startsWith('file:')) connected.add(edge.target);
  }
  
  const isolated = [];
  for (const node of graph.nodes) {
    if (node.type === 'file' && !connected.has(node.id)) {
      isolated.push(node.filePath);
    }
  }
  return isolated;
}

function detectCycles(graph) {
  const adj = new Map();
  for (const e of graph.edges) {
    if (e.source.startsWith('file:') && e.target.startsWith('file:')) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source).push(e.target);
    }
  }

  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(node, path) {
    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      } else if (stack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart).map(id => id.replace('file:', '')));
      }
    }

    stack.delete(node);
    path.pop();
  }

  for (const node of graph.nodes) {
    if (node.type === 'file' && !visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return cycles;
}


// ── Detection Logic ───────────────────────────────────────────────────────────

export function detectLayer(filePath) {
  for (const mapping of LAYER_MAPPING) {
    if (mapping.patterns.some(p => p.test(filePath))) {
      return mapping.layer;
    }
  }
  return 'Core/Other'; // Default fallback
}

export function detectComponents(analysis, graph) {
  if (!analysis.files || analysis.files.length === 0) return [];

  // 1. Drop filename from each path to find common directory prefix
  const paths = analysis.files.map(f => {
    const p = f.filePath.split('/');
    p.pop(); // drop file name
    return p;
  });

  let commonPrefix = paths[0];
  for (const p of paths) {
    let i = 0;
    while (i < commonPrefix.length && i < p.length && commonPrefix[i] === p[i]) i++;
    commonPrefix = commonPrefix.slice(0, i);
    if (commonPrefix.length === 0) break;
  }

  const prefixLen = commonPrefix.length;
  const componentsMap = new Map(); // componentName -> { name, files, layer }
  const wrappers = new Set(['src', 'app', 'lib', 'packages', 'main', 'java', 'test', 'tests', 'com', 'org', 'net']);

  for (const file of analysis.files) {
    const rawParts = file.filePath.split('/');
    rawParts.pop(); // drop file name when generating component name
    const meaningfulParts = rawParts.slice(prefixLen).filter(p => !wrappers.has(p));
    
    let compName = 'root';
    if (meaningfulParts.length > 0) {
      if (meaningfulParts.length > 1 && prefixLen <= 1) {
        // Shallow prefix (e.g. monorepo client/server), keep 2 levels for granularity
        compName = meaningfulParts.slice(0, 2).join('/');
      } else {
        // Deep prefix (e.g. single app com/project/...), keep 1 level
        compName = meaningfulParts[0];
      }
    }
    
    const layer = detectLayer(file.filePath);

    if (!componentsMap.has(compName)) {
      componentsMap.set(compName, { name: compName, files: [], layer: 'Core/Other' });
    }
    
    const comp = componentsMap.get(compName);
    comp.files.push(file.filePath);
    
    if (layer !== 'Core/Other') {
      if (comp.layer === 'Core/Other' || layer === 'Presentation' || layer === 'API') {
         comp.layer = layer;
      }
    }
  }

  return Array.from(componentsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function detectEntryPoints(graph) {
  const inDegree = new Map();
  for (const n of graph.nodes) {
    if (n.type === 'file') inDegree.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (e.target.startsWith('file:')) {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }

  const entryPoints = [];
  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    const name = node.filePath.toLowerCase();
    const basename = name.split('/').pop();
    
    const isStandardName = ENTRY_POINT_NAMES.has(name) || ENTRY_POINT_NAMES.has(basename);
    
    if (isStandardName && (inDegree.get(node.id) || 0) <= 2) {
      entryPoints.push(node.filePath);
    }
  }
  
  return entryPoints.sort();
}

export function extractApiBoundaries(analysis) {
  const apiBoundaries = [];
  
  for (const file of analysis.files) {
    const layer = detectLayer(file.filePath);
    if (layer === 'API') {
      const exported = file.symbols.filter(s => s.kind === 'export');
      if (exported.length > 0) {
        apiBoundaries.push({
          filePath: file.filePath,
          exports: exported.map(e => e.name).filter(Boolean),
        });
      }
    }
  }
  return apiBoundaries;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the architecture model from analysis and graph.
 * 
 * @param {object} analysis - RepositoryAnalysis
 * @param {object} graph - DependencyGraph
 * @returns {object} ArchitectureModel
 */
export function buildArchitectureModel(analysis, graph) {
  const components = detectComponents(analysis, graph);
  const entryPoints = detectEntryPoints(graph);
  const apiBoundaries = extractApiBoundaries(analysis);

  const componentRelations = [];
  const compMap = new Map();
  
  for (const comp of components) {
    for (const f of comp.files) {
      compMap.set(f, comp.name);
    }
  }

  for (const edge of graph.edges) {
    if (edge.source.startsWith('file:')) {
      const srcPath = edge.source.replace('file:', '');
      const srcComp = compMap.get(srcPath);
      
      let targetComp = null;
      let targetType = 'internal';

      if (edge.target.startsWith('file:')) {
        const tgtPath = edge.target.replace('file:', '');
        targetComp = compMap.get(tgtPath);
      } else if (edge.target.startsWith('pkg:')) {
        targetComp = edge.target.replace('pkg:', '');
        targetType = 'external';
      }

      if (srcComp && targetComp && srcComp !== targetComp) {
        componentRelations.push({
          source: srcComp,
          target: targetComp,
          targetType,
          type: edge.type,
          evidenceFile: srcPath
        });
      }
    }
  }
  
  const uniqueRelations = [];
  const seen = new Set();
  for (const rel of componentRelations) {
    const key = `${rel.source}->${rel.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRelations.push(rel);
    }
  }

  const violations = validateArchitecture(components, uniqueRelations);

  return {
    components,
    relations: uniqueRelations,
    entryPoints,
    apiBoundaries,
    isolatedFiles: getIsolatedFiles(graph),
    cycles: detectCycles(graph),
    unresolvedDependencies: graph.meta?.unresolvedImports || 0,
    violations,
    meta: {
      totalComponents: components.length,
      builtAt: new Date().toISOString()
    }
  };
}
