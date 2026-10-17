/**
 * reachability.analyzer.js
 *
 * Evaluates repository reachability and dead code detection:
 * 1. Entry Point Identification (across all 10 supported languages + modern frameworks)
 * 2. Framework & Infrastructure Exemptions (filters out test files, configs, setup scripts)
 * 3. Whole-file unreachable dead code analysis via BFS
 * 4. Granular symbol-level unused export detection (cross-file reference matching)
 */

/**
 * Standard framework and language entry point file patterns.
 */
const ENTRY_POINT_BASENAMES = new Set([
  // JavaScript / TypeScript / Modern Web
  'index.js',
  'index.ts',
  'index.jsx',
  'index.tsx',
  'index.mjs',
  'index.cjs',
  'main.js',
  'main.ts',
  'main.jsx',
  'main.tsx',
  'app.js',
  'app.ts',
  'app.jsx',
  'app.tsx',
  'server.js',
  'server.ts',
  'server.mjs',
  'server.cjs',
  // Framework Routes (Next.js, Nuxt, SvelteKit, Astro)
  'page.jsx',
  'page.tsx',
  'page.js',
  'page.ts',
  'layout.jsx',
  'layout.tsx',
  'layout.js',
  'layout.ts',
  'route.js',
  'route.ts',
  'loading.jsx',
  'loading.tsx',
  'error.jsx',
  'error.tsx',
  'not-found.jsx',
  'not-found.tsx',
  'template.jsx',
  'template.tsx',
  '+page.svelte',
  '+layout.svelte',
  '+server.js',
  '+server.ts',
  // Python
  'main.py',
  'app.py',
  '__main__.py',
  'wsgi.py',
  'asgi.py',
  'manage.py',
  'setup.py',
  // Go
  'main.go',
  // Rust
  'main.rs',
  'lib.rs',
  // Java
  'application.java',
  'main.java',
  // C / C++
  'main.c',
  'main.cpp',
  'main.cc',
  'main.cxx',
  // Kotlin
  'main.kt',
  'application.kt',
  // Swift
  'main.swift',
  'app.swift',
]);

/**
 * Checks whether a given file path is an application or framework entry point.
 */
function isEntryPoint(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.split('/').pop();

  if (ENTRY_POINT_BASENAMES.has(basename)) {
    return true;
  }

  // Java Spring Boot pattern: e.g., DemoApplication.java, MyServiceApplication.java
  if (basename.endsWith('application.java') || basename.endsWith('application.kt')) {
    return true;
  }

  return false;
}

/**
 * Checks whether a file is an exempt framework, test, or config file that
 * should not be flagged as dead unreachable code even if it has no incoming edges.
 */
function isExemptFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.split('/').pop();

  // Test files & directories
  const pathSegments = normalized.split('/');
  if (
    pathSegments.some(seg => ['tests', 'test', '__tests__', '__mocks__', 'spec', 'specs'].includes(seg))
  ) {
    return true;
  }

  if (
    basename.includes('.test.') ||
    basename.includes('.spec.') ||
    basename.startsWith('test_') ||
    basename.endsWith('_test.go') ||
    basename.endsWith('_test.rs') ||
    basename.endsWith('test.py')
  ) {
    return true;
  }

  // Configuration files (vite.config.js, tsconfig.json, webpack.config.js, etc.)
  if (
    basename.includes('.config.') ||
    basename.includes('.rc.') ||
    basename.startsWith('tsconfig') ||
    basename === 'package.json' ||
    basename === 'pyproject.toml' ||
    basename === 'cargo.toml' ||
    basename === 'go.mod' ||
    basename === 'pom.xml' ||
    basename.startsWith('build.gradle') ||
    basename.endsWith('.dockerfile') ||
    basename === 'dockerfile'
  ) {
    return true;
  }

  // Setup scripts, migrations, stories, documentation
  if (
    basename.startsWith('setup') ||
    basename.includes('.setup.') ||
    basename.includes('.stories.') ||
    pathSegments.some(seg => ['scripts', 'bin', 'migrations', 'seeds', '.storybook'].includes(seg))
  ) {
    return true;
  }

  return false;
}

/**
 * Detects exported symbols across files that are never imported anywhere in the repository.
 *
 * @param {Array<object>} files - Array of FileAnalysis objects from parsing
 * @param {object} [graph] - Optional DependencyGraph
 * @returns {Array<object>} - Array of UnusedExport descriptors
 */
function detectUnusedExports(files, graph = null) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  // Step 1: Collect all imported symbols and namespace imports across the entire repository
  const importedSymbolNames = new Set();
  const wildcardImportSources = new Set(); // file sources that were imported wholesale with *
  const importedFilePaths = new Set();

  for (const file of files) {
    if (!file.symbols) continue;

    for (const sym of file.symbols) {
      if (sym.kind === 'import') {
        if (sym.source) {
          const normSource = sym.source.replace(/\\/g, '/').toLowerCase();
          importedFilePaths.add(normSource);
        }

        const specifiers = sym.specifiers || [];
        for (const spec of specifiers) {
          if (typeof spec === 'string') {
            importedSymbolNames.add(spec);
          } else if (spec && typeof spec === 'object') {
            if (spec.type === 'namespace' || spec.name === '*') {
              if (sym.source) {
                wildcardImportSources.add(sym.source.replace(/\\/g, '/').toLowerCase());
              }
            }
            if (spec.name && spec.name !== '*') {
              importedSymbolNames.add(spec.name);
            }
            if (spec.imported && spec.imported !== '*') {
              importedSymbolNames.add(spec.imported);
            }
          }
        }
      } else if (sym.kind === 'export' && sym.exportType === 'reexport' && sym.source) {
        // Re-exporting: export * from './module'
        if (sym.name === '*' || !sym.name) {
          wildcardImportSources.add(sym.source.replace(/\\/g, '/').toLowerCase());
        } else {
          importedSymbolNames.add(sym.name);
        }
      }
    }
  }

  // Step 2: Check each file's exports
  const unusedExports = [];

  for (const file of files) {
    if (file.hasErrors || file.error) continue;
    const rawPath = file.filePath || '';
    if (isEntryPoint(rawPath) || isExemptFile(rawPath)) {
      continue;
    }

    const normPath = rawPath.replace(/\\/g, '/').toLowerCase();
    const cleanPath = normPath.replace(/\.[^.]+$/, '');
    const pathBase = cleanPath.split('/').pop();

    // If any file wildcard-imports this file (e.g. `import * as X from './file'`),
    // all exports of this file are considered used.
    let isWildcarded = false;
    for (const wc of wildcardImportSources) {
      const cleanWc = wc.replace(/^\.?\.?\//, '').replace(/\.[^.]+$/, '');
      const wcBase = cleanWc.split('/').pop();
      if (cleanPath.endsWith(cleanWc) || pathBase === wcBase) {
        isWildcarded = true;
        break;
      }
    }
    if (isWildcarded) continue;

    // Build symbol lookup for definitions in this file to get kind & location
    const definitionsByName = new Map();
    for (const sym of file.symbols || []) {
      if (sym.name && sym.kind !== 'export' && sym.kind !== 'import') {
        definitionsByName.set(sym.name, sym);
      }
    }

    for (const sym of file.symbols || []) {
      if (sym.kind !== 'export') continue;

      const exportName = sym.name;
      // Skip unnamed exports, wildcard exports, or default exports
      if (!exportName || exportName === '*' || exportName === 'default') {
        continue;
      }

      // If the exported identifier is never imported in the repo
      if (!importedSymbolNames.has(exportName)) {
        const def = definitionsByName.get(exportName);
        unusedExports.push({
          name: exportName,
          kind: def?.kind || 'export',
          filePath: rawPath,
          location: sym.location || def?.location || null,
          exportType: sym.exportType || 'named',
        });
      }
    }
  }

  return unusedExports;
}

/**
 * Evaluates the dependency graph and file analysis to identify dead files and unused exports.
 *
 * @param {object} graph - The dependency graph model
 * @param {object} [analysis] - The full FileAnalysis repository payload
 * @returns {object} - { unreachableFiles, entryPoints, unusedExports, exemptFilesCount }
 */
function analyzeReachability(graph, analysis = null) {
  if (!graph || !graph.nodes || !graph.edges) {
    return { unreachableFiles: [], entryPoints: [], unusedExports: [], exemptFilesCount: 0 };
  }

  const nodeIds = Array.isArray(graph.nodes) ? graph.nodes.map(n => n.id) : Object.keys(graph.nodes);

  // Filter entry points: standard entry points or root nodes with out-degree > 0
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

  // Unreachable files: nodes not reached from entry points
  // Exclude test files, configs, scripts, and packages
  let exemptCount = 0;
  const unreachableFiles = nodeIds.filter(id => {
    if (visited.has(id)) return false;
    const rawPath = id.replace(/^file:/, '');
    if (rawPath.startsWith('pkg:') || rawPath.startsWith('moduleNode')) return false;

    if (isExemptFile(rawPath)) {
      exemptCount++;
      return false;
    }
    return true;
  });

  // Detect granular unused exports if file analysis payload is provided
  const filesList = analysis?.files || (Array.isArray(analysis) ? analysis : null);
  const unusedExports = filesList ? detectUnusedExports(filesList, graph) : [];

  return {
    unreachableFiles,
    entryPoints,
    unusedExports,
    exemptFilesCount: exemptCount,
  };
}

export {
  analyzeReachability,
  detectUnusedExports,
  isEntryPoint,
  isExemptFile,
};
