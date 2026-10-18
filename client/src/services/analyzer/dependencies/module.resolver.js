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
  const subproject = getSubproject(importingFile);

  if (!isPython && !isJava && !isCpp && !isGo && !isRust && kind === 'alias') {
    const stripped = specifier.replace(/^[@~]\/?/, '');
    const cleanStripped = stripped.replace(/^src\/?/, '');
    baseCandidates.push(normalisePath(stripped));
    baseCandidates.push(normalisePath(path.posix.join('src', cleanStripped)));
    baseCandidates.push(normalisePath(path.posix.join('lib', cleanStripped)));
    if (subproject) {
      baseCandidates.push(normalisePath(path.posix.join(subproject, stripped)));
      baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', cleanStripped)));
      baseCandidates.push(normalisePath(path.posix.join(subproject, 'lib', cleanStripped)));
    }
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
      baseCandidates.push(normalisePath(path.posix.join('src', pyPath)));
      if (subproject) {
        baseCandidates.push(normalisePath(path.posix.join(subproject, pyPath)));
        baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', pyPath)));
      }
    }
  } else if (isJava) {
    let javaPath = cleanSpecifier.replace(/\./g, '/');
    const isWildcard = javaPath.endsWith('/*');
    if (isWildcard) javaPath = javaPath.slice(0, -2);

    const ktSuffix = javaPath + '.kt';
    const javaSuffix = javaPath + '.java';
    const ktsSuffix = javaPath + '.kts';

    let bestMatch = null;
    for (const knownFile of knownFiles) {
      if (
        knownFile.endsWith('/' + ktSuffix) ||
        knownFile === ktSuffix ||
        knownFile.endsWith('/' + javaSuffix) ||
        knownFile === javaSuffix ||
        knownFile.endsWith('/' + ktsSuffix) ||
        knownFile === ktsSuffix
      ) {
        if (subproject && knownFile.startsWith(subproject + '/')) {
          return { specifier, kind: 'internal', resolvedTo: knownFile, reason: null };
        }
        if (!bestMatch) bestMatch = knownFile;
      }
      if (isWildcard) {
        const pkgDir = javaPath + '/';
        if (
          (knownFile.endsWith('/' + pkgDir.slice(0, -1)) ||
            knownFile.includes('/' + pkgDir) ||
            knownFile.startsWith(pkgDir)) &&
          (knownFile.endsWith('.kt') || knownFile.endsWith('.java'))
        ) {
          if (subproject && knownFile.startsWith(subproject + '/')) {
            return { specifier, kind: 'internal', resolvedTo: knownFile, reason: null };
          }
          if (!bestMatch) bestMatch = knownFile;
        }
      }
    }
    if (bestMatch) {
      return { specifier, kind: 'internal', resolvedTo: bestMatch, reason: null };
    }
    return { specifier, kind: 'external', resolvedTo: null, reason: null };
  } else if (isGo) {
    if (cleanSpecifier.startsWith('.')) {
      baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
    } else {
      baseCandidates.push(normalisePath(cleanSpecifier));
      baseCandidates.push(normalisePath(path.posix.join('src', cleanSpecifier)));
      if (subproject) {
        baseCandidates.push(normalisePath(path.posix.join(subproject, cleanSpecifier)));
        baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', cleanSpecifier)));
      }
    }
  } else if (isRust) {
    if (cleanSpecifier.startsWith('crate::')) {
      const rustPath = cleanSpecifier.replace(/^crate::/, '').replace(/::/g, '/');
      baseCandidates.push(normalisePath(rustPath));
      baseCandidates.push(normalisePath(path.posix.join('src', rustPath)));
      if (subproject) {
        baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', rustPath)));
        baseCandidates.push(normalisePath(path.posix.join(subproject, rustPath)));
      }
    } else if (cleanSpecifier.startsWith('super::')) {
      const rustPath = cleanSpecifier.replace(/^super::/, '../').replace(/::/g, '/');
      baseCandidates.push(normalisePath(path.posix.join(importDir, rustPath)));
    } else {
      baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
      baseCandidates.push(normalisePath(cleanSpecifier));
      baseCandidates.push(normalisePath(path.posix.join('src', cleanSpecifier)));
      if (subproject) {
        baseCandidates.push(normalisePath(path.posix.join(subproject, cleanSpecifier)));
        baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', cleanSpecifier)));
      }
    }
  } else if (isCpp) {
    baseCandidates.push(normalisePath(path.posix.join(importDir, cleanSpecifier)));
    baseCandidates.push(normalisePath(cleanSpecifier));
    baseCandidates.push(normalisePath(path.posix.join('include', cleanSpecifier)));
    baseCandidates.push(normalisePath(path.posix.join('src', cleanSpecifier)));
    if (subproject) {
      baseCandidates.push(normalisePath(path.posix.join(subproject, cleanSpecifier)));
      baseCandidates.push(normalisePath(path.posix.join(subproject, 'include', cleanSpecifier)));
      baseCandidates.push(normalisePath(path.posix.join(subproject, 'src', cleanSpecifier)));
    }
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

  // Fallback scan across knownFiles for aliases and non-relative imports in monorepos
  let fallbackTarget = null;
  if (!isPython && !isJava && !isCpp && !isGo && !isRust && kind === 'alias') {
    fallbackTarget = specifier.replace(/^[@~]\/?/, '');
  } else if (isPython && !cleanSpecifier.startsWith('.')) {
    fallbackTarget = cleanSpecifier.replace(/\./g, '/');
  } else if (isCpp) {
    fallbackTarget = cleanSpecifier;
  } else if (isGo && !cleanSpecifier.startsWith('.')) {
    fallbackTarget = cleanSpecifier;
  } else if (isRust && !cleanSpecifier.startsWith('.')) {
    fallbackTarget = cleanSpecifier.replace(/^crate::/, '').replace(/::/g, '/');
  }

  if (fallbackTarget) {
    const fallbackMatch = scanKnownFilesForMatch({
      targetPath: fallbackTarget,
      extensionsToTry,
      knownFiles,
      subproject,
      isPython,
      isRust,
      checkIndex: !isJava && !isCpp && !isGo,
    });
    if (fallbackMatch) {
      return { specifier, kind: 'internal', resolvedTo: fallbackMatch, reason: null };
    }
  }

  if (isPython || isJava || isGo || isRust || isCpp) {
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

/**
 * Extracts the top-level subproject/package directory from a file path.
 * e.g. "client/tests/foo.js" -> "client"
 *      "packages/ui/src/Button.tsx" -> "packages/ui"
 *      "src/index.js" -> ""
 */
export function getSubproject(importingFile) {
  if (!importingFile) return '';
  const parts = normalisePath(importingFile).split('/');
  if (parts.length <= 1) return '';
  const top = parts[0];
  if (['src', 'lib', 'include', 'dist', 'build'].includes(top)) {
    return '';
  }
  if (['packages', 'apps', 'modules', 'crates', 'services'].includes(top) && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return top;
}

/**
 * Scans knownFiles as a fallback to locate a matching file anywhere in the repository,
 * prioritizing matches that share the importing file's subproject.
 */
function scanKnownFilesForMatch({
  targetPath,
  extensionsToTry,
  knownFiles,
  subproject,
  isPython = false,
  isRust = false,
  checkIndex = true,
}) {
  const normTarget = normalisePath(targetPath);
  const cleanTarget = normTarget.replace(/^src\/?/, '');

  let bestMatch = null;

  for (const knownFile of knownFiles) {
    const isSameSubproject = subproject && knownFile.startsWith(subproject + '/');

    // 1. Exact match with targetPath or src/targetPath
    if (
      knownFile === normTarget ||
      knownFile.endsWith('/' + normTarget) ||
      knownFile === 'src/' + cleanTarget ||
      knownFile.endsWith('/src/' + cleanTarget) ||
      knownFile === cleanTarget ||
      knownFile.endsWith('/' + cleanTarget)
    ) {
      if (isSameSubproject) return knownFile;
      if (!bestMatch) bestMatch = knownFile;
      continue;
    }

    // 2. Match with extensions
    for (const ext of extensionsToTry) {
      const withExt = cleanTarget + ext;
      if (
        knownFile === withExt ||
        knownFile.endsWith('/' + withExt) ||
        knownFile === 'src/' + withExt ||
        knownFile.endsWith('/src/' + withExt)
      ) {
        if (isSameSubproject) return knownFile;
        if (!bestMatch) bestMatch = knownFile;
        break;
      }
    }

    // 3. Language-specific package/module markers
    if (isPython) {
      const initTarget = cleanTarget + '/__init__.py';
      if (
        knownFile === initTarget ||
        knownFile.endsWith('/' + initTarget) ||
        knownFile === 'src/' + initTarget ||
        knownFile.endsWith('/src/' + initTarget)
      ) {
        if (isSameSubproject) return knownFile;
        if (!bestMatch) bestMatch = knownFile;
      }
    } else if (isRust) {
      const modTarget = cleanTarget + '/mod.rs';
      if (
        knownFile === modTarget ||
        knownFile.endsWith('/' + modTarget) ||
        knownFile === 'src/' + modTarget ||
        knownFile.endsWith('/src/' + modTarget)
      ) {
        if (isSameSubproject) return knownFile;
        if (!bestMatch) bestMatch = knownFile;
      }
    } else if (checkIndex) {
      for (const ext of extensionsToTry) {
        const indexTarget = cleanTarget + '/index' + ext;
        if (
          knownFile === indexTarget ||
          knownFile.endsWith('/' + indexTarget) ||
          knownFile === 'src/' + indexTarget ||
          knownFile.endsWith('/src/' + indexTarget)
        ) {
          if (isSameSubproject) return knownFile;
          if (!bestMatch) bestMatch = knownFile;
          break;
        }
      }
    }
  }

  return bestMatch;
}

