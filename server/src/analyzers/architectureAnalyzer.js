'use strict';

/**
 * architectureAnalyzer.js
 * 
 * Implements architecture intelligence. Groups files into logical components,
 * identifies layers, detects entry points, and surfaces API boundaries.
 */

const { getIsolatedFiles } = require('./dependencyGraph');

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

// ── Detection Logic ───────────────────────────────────────────────────────────

function detectLayer(filePath) {
  for (const mapping of LAYER_MAPPING) {
    if (mapping.patterns.some(p => p.test(filePath))) {
      return mapping.layer;
    }
  }
  return 'Core/Other'; // Default fallback
}

function detectComponents(analysis, graph) {
  const componentsMap = new Map(); // componentName -> { name, files, layer }

  for (const file of analysis.files) {
    const parts = file.filePath.split('/');
    let compName = 'root';
    
    if (parts.length > 1) {
      if (parts[0] === 'src' && parts.length > 2) {
        compName = parts[1];
      } else {
        compName = parts[0];
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

function detectEntryPoints(graph) {
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

function extractApiBoundaries(analysis) {
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
function buildArchitectureModel(analysis, graph) {
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

  return {
    components,
    relations: uniqueRelations,
    entryPoints,
    apiBoundaries,
    isolatedFiles: getIsolatedFiles(graph),
    meta: {
      totalComponents: components.length,
      builtAt: new Date().toISOString()
    }
  };
}

module.exports = {
  buildArchitectureModel,
  detectComponents,
  detectEntryPoints,
  extractApiBoundaries
};
