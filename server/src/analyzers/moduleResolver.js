/**
 * moduleResolver.js
 *
 * Resolves JavaScript/TypeScript import/require specifiers to actual files
 * inside a repository.
 *
 * ── Resolution algorithm ─────────────────────────────────────────────────────
 *
 * Given:
 *   - importingFile:  relative path of the file that contains the import
 *   - specifier:      the raw import string, e.g. './utils/helper' or 'express'
 *   - knownFiles:     Set of relative file paths present in the repository
 *
 * Step 1 — Classify the specifier
 *   - Relative (starts with './' or '../'):  attempt file resolution (steps 2–4)
 *   - Absolute/bare (e.g. 'express', '@org/pkg'):  external package, stop here
 *
 * Step 2 — Exact match (specifier already has extension)
 *   Candidate = join(dir(importingFile), specifier)
 *   If knownFiles contains candidate → resolved.
 *
 * Step 3 — Extension probing
 *   Try appending each supported extension in order:
 *     .js  .jsx  .ts  .tsx
 *   First match wins.
 *
 * Step 4 — Index file resolution
 *   If specifier resolves to a directory that is referenced, try:
 *     <specifier>/index.js
 *     <specifier>/index.jsx
 *     <specifier>/index.ts
 *     <specifier>/index.tsx
 *   First match wins.
 *
 * Step 5 — Unresolved
 *   Return { resolved: false, reason: '...' }
 *
 * ── Limitations ──────────────────────────────────────────────────────────────
 *
 *   - No tsconfig.json path aliases (e.g. @/components/Button)
 *   - No package.json "exports" field resolution
 *   - No webpack/vite alias resolution
 *   - No URL imports (ESM with http:// specifiers)
 *   - Only JS/TS files are resolved; CSS/JSON/asset imports remain unresolved
 *
 * These are intentional scope restrictions for Step 3. Document and extend
 * as needed in later steps.
 */

'use strict';

const path = require('path');

// Supported extensions tried in order during extension probing.
const RESOLUTION_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.cc', '.cxx', '.h', '.hpp'];

/**
 * Classify a module specifier.
 *
 * @param {string} specifier
 * @returns {'relative'|'external'}
 */
function classifySpecifier(specifier, isCpp = false, isJava = false, isPython = false) {
  if (isCpp) {
    // C++ includes are either absolute (system) or relative to current file usually
    // But our parser extracts external as 'external' and internal as 'internal' already via type
    // We will just let C++ imports pass through as relative if they aren't marked external by parser
    return specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../') ? 'relative' : 'relative';
  }
  if (isPython || isJava) {
    // Python and Java use dotted paths. They are typically absolute from root, or relative if starting with '.' (Python).
    // Let's treat them all as relative to the repo root if they are not explicitly relative.
    // Actually, we'll handle them inside resolveImport specifically.
    return 'relative';
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return 'relative';
  }

  if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('src/')) {
    return 'alias';
  }

  return 'external';
}

/**
 * Resolve a single import specifier to a file path inside the repository.
 *
 * @param {object} opts
 * @param {string}      opts.importingFile  — relative path of the importing file (forward slashes)
 * @param {string}      opts.specifier      — raw import/require string
 * @param {Set<string>} opts.knownFiles     — set of all relative repository file paths
 *
 * @returns {ResolvedImport}
 *
 * ResolvedImport shape:
 * {
 *   specifier:  string       — original specifier
 *   kind:       'internal' | 'external' | 'unresolved'
 *   resolvedTo: string|null  — relative path of the target file (kind === 'internal')
 *   reason:     string|null  — why resolution failed (kind === 'unresolved')
 * }
 */
function resolveImport({ importingFile, specifier, knownFiles, type }) {
  const ext = path.posix.extname(importingFile).toLowerCase();
  const isPython = ext === '.py';
  const isJava   = ext === '.java' || ext === '.kt' || ext === '.kts';
  const isCpp    = ['.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext);

  // C++ parser already classifies internal vs external via 'type'
  if (isCpp && type === 'external') {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  const kind = classifySpecifier(specifier, isCpp, isJava, isPython);

  if (kind === 'external' && !isPython && !isJava && !isCpp) {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  let baseCandidates = [];
  const importDir = path.posix.dirname(importingFile);

  if (!isPython && !isJava && !isCpp && kind === 'alias') {
    const stripped = specifier.replace(/^[@~]\//, '');
    baseCandidates.push(normalisePath(stripped));
    baseCandidates.push(normalisePath(path.posix.join('src', stripped)));
    baseCandidates.push(normalisePath(path.posix.join('lib', stripped)));
  } else if (isPython) {
    // Python dotted paths: `foo.bar` -> `foo/bar`
    // If it's relative like `.foo`, it means sibling. `..foo` means parent.
    // Actually, `from . import foo` gives specifier `.` or `.foo`.
    // Tree-sitter might give `foo.bar`.
    let pyPath = specifier;
    if (pyPath.startsWith('.')) {
      // Relative import
      pyPath = pyPath.replace(/^\.+/, (match) => {
         return '../'.repeat(match.length - 1) + './';
      });
      pyPath = pyPath.replace(/\./g, '/');
      baseCandidates.push(normalisePath(path.posix.join(importDir, pyPath)));
    } else {
      // Absolute import from repo root
      pyPath = pyPath.replace(/\./g, '/');
      baseCandidates.push(normalisePath(pyPath));
    }
  } else if (isJava) {
    // Java dotted paths: `com.example.Foo` -> `com/example/Foo`
    let javaPath = specifier.replace(/\./g, '/');
    baseCandidates.push(normalisePath(javaPath));
  } else if (isCpp) {
    baseCandidates.push(normalisePath(path.posix.join(importDir, specifier)));
  } else {
    baseCandidates.push(normalisePath(path.posix.join(importDir, specifier)));
  }

  // Step 3 & 4 — probing candidates
  let extensionsToTry = RESOLUTION_EXTENSIONS;
  if (isPython) extensionsToTry = ['.py'];
  else if (isJava) extensionsToTry = ['.java'];
  else if (isCpp) extensionsToTry = ['.cpp', '.cc', '.cxx', '.h', '.hpp'];
  else extensionsToTry = ['.js', '.jsx', '.ts', '.tsx'];

  for (const rawCandidate of baseCandidates) {
    // Step 2 — exact match
    if (knownFiles.has(rawCandidate)) {
      return { specifier, kind: 'internal', resolvedTo: rawCandidate, reason: null };
    }

    // Step 3 — extension probing
    for (const ext of extensionsToTry) {
      const candidate = rawCandidate + ext;
      if (knownFiles.has(candidate)) {
        return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
      }
    }

    // Step 4 — index file resolution
    if (isPython) {
      const candidate = normalisePath(path.posix.join(rawCandidate, `__init__.py`));
      if (knownFiles.has(candidate)) {
        return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
      }
    } else if (!isJava && !isCpp) {
      for (const ext of extensionsToTry) {
        const candidate = normalisePath(path.posix.join(rawCandidate, `index${ext}`));
        if (knownFiles.has(candidate)) {
          return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
        }
      }
    }
  }

  // If Java/Python and not found, maybe it's external (e.g. `import requests` or `import java.util.*`)
  if (isPython || isJava) {
     return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  // Step 5 — unresolved
  return {
    specifier,
    kind: 'unresolved',
    resolvedTo: null,
    reason: `Cannot resolve '${specifier}' from '${importingFile}' — no matching file found`,
  };
}

/**
 * Build a Set of all known file paths from a RepositoryAnalysis.
 *
 * @param {object} analysis  — RepositoryAnalysis produced by repositoryAnalyzer
 * @returns {Set<string>}
 */
function buildKnownFilesSet(analysis) {
  const set = new Set();
  for (const f of analysis.files) {
    if (f.filePath) set.add(normalisePath(f.filePath));
  }
  return set;
}

/**
 * Resolve all imports across every file in a RepositoryAnalysis.
 *
 * Returns a Map: filePath → ResolvedImport[]
 *
 * @param {object}      analysis    — RepositoryAnalysis
 * @param {Set<string>} knownFiles  — from buildKnownFilesSet()
 * @returns {Map<string, ResolvedImport[]>}
 */
function resolveAllImports(analysis, knownFiles) {
  const result = new Map();

  for (const fileAnalysis of analysis.files) {
    const { filePath, symbols } = fileAnalysis;
    if (!symbols || !symbols.length) {
      result.set(filePath, []);
      continue;
    }

    const resolvedImports = [];

    for (const sym of symbols) {
      if (sym.kind !== 'import') continue;

      const resolution = resolveImport({
        importingFile: normalisePath(filePath),
        specifier:     sym.source,
        knownFiles,
        type:          sym.specifiers && sym.specifiers.length > 0 ? sym.specifiers[0].type : undefined
      });

      resolvedImports.push({
        ...resolution,
        specifiers: sym.specifiers,
        location:   sym.location,
      });
    }

    result.set(filePath, resolvedImports);
  }

  return result;
}

/**
 * Normalise a path to forward slashes and strip any leading './'.
 * Keeps leading '../' intact so relative resolution works correctly.
 *
 * @param {string} p
 * @returns {string}
 */
function normalisePath(p) {
  // Replace backslashes (Windows)
  p = p.replace(/\\/g, '/');
  // Remove leading './' added by path.posix.join when joining with an empty dir
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}

module.exports = {
  resolveImport,
  resolveAllImports,
  buildKnownFilesSet,
  classifySpecifier,
  RESOLUTION_EXTENSIONS,
};
