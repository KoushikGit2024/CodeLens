/**
 * moduleResolver.js
 *
 * It takes the AST import symbols, then extracts the target paths,
 * and then it applies repository-aware resolution to connect internal graphs.
 *
 * How this file is structured:
 *   1. classifySpecifier()  — It analyzes the import string, then extracts its origin pattern, and then it applies a relative/alias/external tag.
 *   2. resolveImport()      — It reads the importing file path, then extracts the specifier candidates, and then it applies the known files map to find a match.
 *   3. resolveAllImports()  — It loops through the entire analysis payload, then extracts all file symbols, and then it applies resolution to the whole repository.
 */

import path from 'path-browserify';

export const RESOLUTION_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.go',
  '.rs',
  '.c',
];

/**
 * It evaluates the specifier string, then extracts its leading characters,
 * and then it applies the corresponding module resolution category.
 */
export function classifySpecifier(
  specifier,
  isCpp = false,
  isJava = false,
  isPython = false,
  isGo = false,
  isRust = false
) {
  if (isCpp || isGo || isRust) {
    return specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../')
      ? 'relative'
      : 'relative';
  }
  if (isPython || isJava) {
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
 * It parses the raw import text, then extracts possible file extensions,
 * and then it applies the internal path matching logic to return a ResolvedImport object.
 */
export function resolveImport({ importingFile, specifier, knownFiles, type }) {
  let cleanSpecifier = specifier;
  const qIndex = cleanSpecifier.indexOf('?');
  if (qIndex !== -1) cleanSpecifier = cleanSpecifier.substring(0, qIndex);
  const hIndex = cleanSpecifier.indexOf('#');
  if (hIndex !== -1) cleanSpecifier = cleanSpecifier.substring(0, hIndex);

  const ext = path.posix.extname(importingFile).toLowerCase();
  const isPython = ext === '.py';
  const isJava = ext === '.java' || ext === '.kt' || ext === '.kts';
  const isCpp = ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.c'].includes(ext);
  const isGo = ext === '.go';
  const isRust = ext === '.rs';

  if ((isCpp || isRust) && type === 'external') {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  const kind = classifySpecifier(cleanSpecifier, isCpp, isJava, isPython, isGo, isRust);

  if (kind === 'external' && !isPython && !isJava && !isCpp && !isGo && !isRust) {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  let baseCandidates = [];
  const importDir = path.posix.dirname(importingFile);

  if (!isPython && !isJava && !isCpp && !isGo && !isRust && kind === 'alias') {
    const stripped = specifier.replace(/^[@~]\/?/, '');
    baseCandidates.push(normalisePath(stripped));
    baseCandidates.push(normalisePath(path.posix.join('src', stripped)));
    baseCandidates.push(normalisePath(path.posix.join('lib', stripped)));
  } else if (isPython) {
    let pyPath = cleanSpecifier;
    if (pyPath.startsWith('.')) {
      pyPath = pyPath.replace(/^\.+/, match => {
        return '../'.repeat(match.length - 1) + './';
      });
      pyPath = pyPath.replace(/\./g, '/');
      baseCandidates.push(normalisePath(path.posix.join(importDir, pyPath)));
    } else {
      pyPath = pyPath.replace(/\./g, '/');
      baseCandidates.push(normalisePath(pyPath));
    }
  } else if (isJava) {
    let javaPath = cleanSpecifier.replace(/\./g, '/');
    const isWildcard = javaPath.endsWith('/*');
    if (isWildcard) javaPath = javaPath.slice(0, -2);

    const ktSuffix = javaPath + '.kt';
    const javaSuffix = javaPath + '.java';
    const ktsSuffix = javaPath + '.kts';

    for (const knownFile of knownFiles) {
      if (
        knownFile.endsWith('/' + ktSuffix) ||
        knownFile === ktSuffix ||
        knownFile.endsWith('/' + javaSuffix) ||
        knownFile === javaSuffix ||
        knownFile.endsWith('/' + ktsSuffix) ||
        knownFile === ktsSuffix
      ) {
        return { specifier, kind: 'internal', resolvedTo: knownFile, reason: null };
      }
      if (isWildcard) {
        const pkgDir = javaPath + '/';
        if (
          (knownFile.endsWith('/' + pkgDir.slice(0, -1)) ||
            knownFile.includes('/' + pkgDir) ||
            knownFile.startsWith(pkgDir)) &&
          (knownFile.endsWith('.kt') || knownFile.endsWith('.java'))
        ) {
          break;
        }
      }
    }
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  } else if (isGo) {
    // Go imports are usually absolute paths relative to GOPATH/module root, treated as external if not found
    baseCandidates.push(normalisePath(cleanSpecifier));
  } else if (isRust) {
    // Rust modules usually map directly to files `foo.rs` or `foo/mod.rs`
    baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
    baseCandidates.push(normalisePath(cleanSpecifier));
  } else if (isCpp) {
    baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
  } else {
    baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
  }

  let extensionsToTry = RESOLUTION_EXTENSIONS;
  if (isPython) extensionsToTry = ['.py'];
  else if (isJava) extensionsToTry = ['.java'];
  else if (isCpp) extensionsToTry = ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.c'];
  else if (isGo) extensionsToTry = ['.go'];
  else if (isRust) extensionsToTry = ['.rs'];
  else extensionsToTry = ['.js', '.jsx', '.ts', '.tsx'];

  for (const rawCandidate of baseCandidates) {
    if (knownFiles.has(rawCandidate)) {
      return { specifier, kind: 'internal', resolvedTo: rawCandidate, reason: null };
    }

    for (const ext of extensionsToTry) {
      const candidate = rawCandidate + ext;
      if (knownFiles.has(candidate)) {
        return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
      }
    }

    if (isPython) {
      const candidate = normalisePath(path.posix.join(rawCandidate, `__init__.py`));
      if (knownFiles.has(candidate)) {
        return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
      }
    } else if (isRust) {
      const candidate = normalisePath(path.posix.join(rawCandidate, `mod.rs`));
      if (knownFiles.has(candidate)) {
        return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
      }
    } else if (!isJava && !isCpp && !isGo) {
      for (const ext of extensionsToTry) {
        const candidate = normalisePath(path.posix.join(rawCandidate, `index${ext}`));
        if (knownFiles.has(candidate)) {
          return { specifier, kind: 'internal', resolvedTo: candidate, reason: null };
        }
      }
    }
  }

  if (isPython || isJava || isGo || isRust) {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  if (kind === 'alias' && specifier.startsWith('@')) {
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  }

  return {
    specifier,
    kind: 'unresolved',
    resolvedTo: null,
    reason: `Cannot resolve '${specifier}' from '${importingFile}' — no matching file found`,
  };
}

/**
 * It iterates over the analyzed files, then extracts their paths,
 * and then it applies them into a Set for fast lookup.
 */
export function buildKnownFilesSet(analysis) {
  const set = new Set();
  for (const f of analysis.files) {
    if (f.filePath) set.add(normalisePath(f.filePath));
  }
  return set;
}

/**
 * It iterates through the repository files, then extracts all internal symbols,
 * and then it applies the resolver logic to map them together.
 */
export function resolveAllImports(analysis, knownFiles) {
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
        specifier: sym.source,
        knownFiles,
        type: sym.specifiers && sym.specifiers.length > 0 ? sym.specifiers[0].type : undefined,
      });

      resolvedImports.push({
        ...resolution,
        specifiers: sym.specifiers,
        location: sym.location,
      });
    }

    result.set(filePath, resolvedImports);
  }

  return result;
}

/**
 * It detects the slash characters, then extracts OS specific backslashes,
 * and then it applies standard POSIX formatting.
 */
function normalisePath(p) {
  p = p.replace(/\\/g, '/');
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}
