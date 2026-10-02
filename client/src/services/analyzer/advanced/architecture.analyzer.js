/**
 * architecture.analyzer.js
 *
 * It evaluates directory structures, then extracts logical layer mappings,
 * and then it applies architectural validation to surface API boundaries and rule violations.
 */

import { validateArchitecture } from './architecture.rules.js';
import { createAnalysisNode } from '../parsing/symbols.js';

// ── Heuristics Configuration ──────────────────────────────────────────────────

const LAYER_MAPPING = [
  { layer: 'Presentation', patterns: [/\.jsx$/, /\.tsx$/, /\/components\//, /\/pages\//, /\/views\//, /\/ui\//] },
  { layer: 'API', patterns: [/\/controllers\//, /\/routes\//, /\/api\//, /Controller\.(js|ts|go|java|rs)$/] },
  { layer: 'Service', patterns: [/\/services\//, /Service\.(js|ts|go|java|rs)$/, /\/core\//] },
  { layer: 'Data', patterns: [/\/models\//, /\/repositories\//, /\/db\//, /Model\.(js|ts|go|java|rs)$/] },
];

const ENTRY_POINT_NAMES = new Set([
  'server.js',
  'app.js',
  'index.js',
  'main.js',
  'main.jsx',
  'index.jsx',
  'src/server.js',
  'src/app.js',
  'src/index.js',
  'src/main.js',
  'src/main.jsx',
  'src/index.jsx',
  'src/index.tsx',
  'src/main.tsx',
  'main.go',
  'main.rs',
  'application.java',
  'src/main.rs',
]);

// ── Detection Logic ───────────────────────────────────────────────────────────

/**
 * It checks the file path against regex patterns, then extracts the matching layer designation,
 * and then it applies a 'Core/Other' fallback if no match is found.
 */
export function detectLayer(filePath) {
  for (const mapping of LAYER_MAPPING) {
    if (mapping.patterns.some(p => p.test(filePath))) {
      return mapping.layer;
    }
  }
  return 'Core/Other';
}

/**
 * It tokenizes the file paths to find common prefixes, then extracts the meaningful directory clusters,
 * and then it applies the AnalysisNode schema to build distinct component objects.
 */
export function detectComponents(analysis, graph) {
  if (!analysis.files || analysis.files.length === 0) return [];

  const paths = analysis.files.map(f => {
    const p = f.filePath.split('/');
    p.pop();
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
  const componentsMap = new Map();
  const wrappers = new Set(['src', 'app', 'lib', 'packages', 'main', 'java', 'test', 'tests', 'com', 'org', 'net']);

  for (const file of analysis.files) {
    const rawParts = file.filePath.split('/');
    rawParts.pop();
    const meaningfulParts = rawParts.slice(prefixLen).filter(p => !wrappers.has(p));

    let compName = 'root';
    if (meaningfulParts.length > 0) {
      if (meaningfulParts.length > 1 && prefixLen <= 1) {
        compName = meaningfulParts.slice(0, 2).join('/');
      } else {
        compName = meaningfulParts[0];
      }
    }

    const layer = detectLayer(file.filePath);

    if (!componentsMap.has(compName)) {
      // It initiates a new component cluster, then extracts its label, and then it applies the React Flow node schema.
      componentsMap.set(
        compName,
        createAnalysisNode({
          id: `comp-${compName}`,
          type: 'componentNode',
          label: compName,
          layer: 'Core/Other',
        })
      );
      // We attach the raw file list temporarily to build the relations later
      componentsMap.get(compName)._files = [];
    }

    const compNode = componentsMap.get(compName);
    compNode._files.push(file.filePath);

    if (layer !== 'Core/Other') {
      if (compNode.data.layer === 'Core/Other' || layer === 'Presentation' || layer === 'API') {
        compNode.data.layer = layer;
      }
    }
  }

  return Array.from(componentsMap.values()).sort((a, b) => a.data.label.localeCompare(b.data.label));
}

/**
 * It counts incoming edges across the graph, then extracts nodes with standard filenames,
 * and then it applies a low-degree threshold filter to confirm true entry points.
 */
export function detectEntryPoints(graph) {
  const inDegree = new Map();
  for (const n of graph.nodes) {
    if (n.type === 'fileNode') inDegree.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (e.target.startsWith('file:')) {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }

  const entryPoints = [];
  for (const node of graph.nodes) {
    if (node.type !== 'fileNode') continue;

    const name = node.data.filePath.toLowerCase();
    const basename = name.split('/').pop();

    const isStandardName = ENTRY_POINT_NAMES.has(name) || ENTRY_POINT_NAMES.has(basename);

    if (isStandardName && (inDegree.get(node.id) || 0) <= 2) {
      entryPoints.push(node.data.filePath);
    }
  }

  return entryPoints.sort();
}

/**
 * It filters the analysis payload for API layer files, then extracts their export symbols,
 * and then it applies them into an array mapping the system's public boundaries.
 */
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
 * It integrates components and entry points, then extracts inter-component relations,
 * and then it applies the rule validator to generate the final ArchitectureModel.
 */
export function buildArchitectureModel(analysis, graph) {
  const components = detectComponents(analysis, graph);
  const entryPoints = detectEntryPoints(graph);
  const apiBoundaries = extractApiBoundaries(analysis);

  const componentRelations = [];
  const compMap = new Map();

  for (const compNode of components) {
    for (const f of compNode._files) {
      compMap.set(f, compNode.data.label);
    }
    compNode.data.files = [...compNode._files]; // persist for sidebar display
    delete compNode._files; // Clean up temporary data
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
          evidenceFile: srcPath,
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
    layers: components,
    uniqueRelations,
    boundaryViolations: violations,
    apiBoundaries,
    entryPoints,
  };
}
