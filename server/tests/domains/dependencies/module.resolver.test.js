/**
 * tests/analyzers/moduleResolver.test.js
 *
 * Tests for the module resolver — covers all resolution rules, edge cases,
 * internal vs external classification, and unresolved imports.
 */

'use strict';

const {
  resolveImport,
  resolveAllImports,
  buildKnownFilesSet,
  classifySpecifier,
  RESOLUTION_EXTENSIONS,
} = require('../../../src/domains/dependencies/module.resolver');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Set from an array of relative paths. */
function files(...paths) {
  return new Set(paths);
}

/** Shorthand for resolveImport */
function resolve(importingFile, specifier, knownFilesArray) {
  return resolveImport({
    importingFile,
    specifier,
    knownFiles: new Set(knownFilesArray),
  });
}

// ── classifySpecifier ─────────────────────────────────────────────────────────

describe('classifySpecifier', () => {
  test('./foo is relative', () => {
    expect(classifySpecifier('./foo')).toBe('relative');
  });

  test('../foo is relative', () => {
    expect(classifySpecifier('../foo')).toBe('relative');
  });

  test('express is external', () => {
    expect(classifySpecifier('express')).toBe('external');
  });

  test('@org/pkg is external', () => {
    expect(classifySpecifier('@org/pkg')).toBe('external');
  });

  test('fs is external', () => {
    expect(classifySpecifier('fs')).toBe('external');
  });

  test('path/to/thing (no leading dot) is external', () => {
    expect(classifySpecifier('path/to/thing')).toBe('external');
  });
});

// ── External packages ─────────────────────────────────────────────────────────

describe('resolveImport — external packages', () => {
  test('express resolves as external', () => {
    const result = resolve('src/app.js', 'express', []);
    expect(result.kind).toBe('external');
    expect(result.specifier).toBe('express');
    expect(result.resolvedTo).toBeNull();
  });

  test('mongoose resolves as external', () => {
    const result = resolve('src/models/User.js', 'mongoose', []);
    expect(result.kind).toBe('external');
  });

  test('@org/pkg resolves as external', () => {
    const result = resolve('src/index.js', '@org/pkg', []);
    expect(result.kind).toBe('external');
  });

  test('fs is external even though it looks like a path', () => {
    const result = resolve('src/utils.js', 'fs', ['fs']);
    expect(result.kind).toBe('external'); // bare specifier → external
  });
});

// ── Exact match (file already has extension) ──────────────────────────────────

describe('resolveImport — exact match', () => {
  test('exact .js match', () => {
    const result = resolve('src/app.js', './routes/user.js', ['src/routes/user.js']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/routes/user.js');
  });

  test('exact .ts match', () => {
    const result = resolve('src/app.ts', './services/auth.ts', ['src/services/auth.ts']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/services/auth.ts');
  });
});

// ── Relative JS imports — extension probing ───────────────────────────────────

describe('resolveImport — relative JS/TS imports (extension probing)', () => {
  test('./foo resolves to foo.js', () => {
    const result = resolve('src/app.js', './foo', ['src/foo.js']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/foo.js');
  });

  test('./foo resolves to foo.jsx', () => {
    const result = resolve('src/app.js', './foo', ['src/foo.jsx']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/foo.jsx');
  });

  test('./foo resolves to foo.ts', () => {
    const result = resolve('src/app.ts', './foo', ['src/foo.ts']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/foo.ts');
  });

  test('./foo resolves to foo.tsx', () => {
    const result = resolve('src/App.tsx', './Button', ['src/Button.tsx']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/Button.tsx');
  });

  test('.js is tried before .jsx', () => {
    // Both exist; .js wins
    const result = resolve('src/app.js', './Cmp', ['src/Cmp.js', 'src/Cmp.jsx']);
    expect(result.resolvedTo).toBe('src/Cmp.js');
  });

  test('parent directory import (../)', () => {
    const result = resolve('src/controllers/auth.js', '../services/authService', ['src/services/authService.js']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/services/authService.js');
  });

  test('nested import', () => {
    const result = resolve('src/index.js', './utils/helper', ['src/utils/helper.js']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/utils/helper.js');
  });
});

// ── Index file resolution ─────────────────────────────────────────────────────

describe('resolveImport — index file resolution', () => {
  test('./utils resolves to utils/index.js', () => {
    const result = resolve('src/app.js', './utils', ['src/utils/index.js']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/utils/index.js');
  });

  test('./utils resolves to utils/index.ts', () => {
    const result = resolve('src/app.ts', './utils', ['src/utils/index.ts']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/utils/index.ts');
  });

  test('./components resolves to components/index.tsx', () => {
    const result = resolve('src/pages/Home.tsx', './components', ['src/pages/components/index.tsx']);
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('src/pages/components/index.tsx');
  });

  test('index.js tried before index.jsx', () => {
    const result = resolve('src/app.js', './utils', ['src/utils/index.js', 'src/utils/index.jsx']);
    expect(result.resolvedTo).toBe('src/utils/index.js');
  });
});

// ── Unresolved imports ────────────────────────────────────────────────────────

describe('resolveImport — unresolved imports', () => {
  test('./doesNotExist returns unresolved', () => {
    const result = resolve('src/app.js', './doesNotExist', []);
    expect(result.kind).toBe('unresolved');
    expect(result.resolvedTo).toBeNull();
    expect(result.reason).toMatch(/Cannot resolve/);
  });

  test('reason includes the specifier', () => {
    const result = resolve('src/app.js', './missing/module', []);
    expect(result.reason).toContain('./missing/module');
  });

  test('reason includes the importing file', () => {
    const result = resolve('src/deep/file.js', './nope', []);
    expect(result.reason).toContain('src/deep/file.js');
  });

  test('file in different directory does NOT match', () => {
    // Specifier from src/app.js for './utils' should not resolve to 'lib/utils.js'
    const result = resolve('src/app.js', './utils', ['lib/utils.js']);
    expect(result.kind).toBe('unresolved');
  });
});

// ── buildKnownFilesSet ────────────────────────────────────────────────────────

describe('buildKnownFilesSet', () => {
  test('builds a set from analysis.files', () => {
    const analysis = {
      files: [
        { filePath: 'src/app.js' },
        { filePath: 'src/utils.ts' },
      ],
    };
    const set = buildKnownFilesSet(analysis);
    expect(set.has('src/app.js')).toBe(true);
    expect(set.has('src/utils.ts')).toBe(true);
    expect(set.size).toBe(2);
  });

  test('ignores files without filePath', () => {
    const analysis = { files: [{ filePath: 'ok.js' }, {}] };
    const set = buildKnownFilesSet(analysis);
    expect(set.size).toBe(1);
  });
});

// ── resolveAllImports ─────────────────────────────────────────────────────────

describe('resolveAllImports', () => {
  test('resolves imports across a multi-file analysis', () => {
    const analysis = {
      files: [
        {
          filePath: 'src/index.js',
          symbols: [
            { kind: 'import', source: './utils', specifiers: [{ name: 'utils', alias: null, type: 'default' }], location: null },
            { kind: 'import', source: 'express', specifiers: [{ name: 'express', alias: null, type: 'default' }], location: null },
          ],
        },
        {
          filePath: 'src/utils.js',
          symbols: [],
        },
      ],
    };

    const knownFiles = buildKnownFilesSet(analysis);
    const resolved   = resolveAllImports(analysis, knownFiles);

    const indexImports = resolved.get('src/index.js');
    expect(indexImports).toHaveLength(2);

    const utilsImport = indexImports.find(r => r.specifier === './utils');
    expect(utilsImport.kind).toBe('internal');
    expect(utilsImport.resolvedTo).toBe('src/utils.js');

    const expressImport = indexImports.find(r => r.specifier === 'express');
    expect(expressImport.kind).toBe('external');
  });

  test('files with no imports get empty array', () => {
    const analysis = {
      files: [{ filePath: 'src/noImports.js', symbols: [] }],
    };
    const knownFiles = buildKnownFilesSet(analysis);
    const resolved   = resolveAllImports(analysis, knownFiles);
    expect(resolved.get('src/noImports.js')).toEqual([]);
  });
});

// ── RESOLUTION_EXTENSIONS constant ───────────────────────────────────────────

describe('RESOLUTION_EXTENSIONS', () => {
  test('contains all supported extensions', () => {
    expect(RESOLUTION_EXTENSIONS).toEqual(['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.cc', '.cxx', '.h', '.hpp']);
  });
});
