/**
 * tests/analyzers/moduleResolver.test.js
 *
 * Tests for the module resolver — covers all resolution rules, edge cases,
 * internal vs external classification, and unresolved imports.
 */

'use strict';

import {
  resolveImport,
  resolveAllImports,
  buildKnownFilesSet,
  classifySpecifier,
  getSubproject,
  RESOLUTION_EXTENSIONS,
} from '@/services/analyzer/dependencies/module.resolver.js';

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
      files: [{ filePath: 'src/app.js' }, { filePath: 'src/utils.ts' }],
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
            {
              kind: 'import',
              source: './utils',
              specifiers: [{ name: 'utils', alias: null, type: 'default' }],
              location: null,
            },
            {
              kind: 'import',
              source: 'express',
              specifiers: [{ name: 'express', alias: null, type: 'default' }],
              location: null,
            },
          ],
        },
        {
          filePath: 'src/utils.js',
          symbols: [],
        },
      ],
    };

    const knownFiles = buildKnownFilesSet(analysis);
    const resolved = resolveAllImports(analysis, knownFiles);

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
    const resolved = resolveAllImports(analysis, knownFiles);
    expect(resolved.get('src/noImports.js')).toEqual([]);
  });
});

// ── RESOLUTION_EXTENSIONS constant ───────────────────────────────────────────

describe('RESOLUTION_EXTENSIONS', () => {
  test('contains all supported extensions', () => {
    expect(RESOLUTION_EXTENSIONS).toEqual(
      expect.arrayContaining([
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
      ])
    );
  });
});

// ── getSubproject ────────────────────────────────────────────────────────────

describe('getSubproject', () => {
  test('identifies top-level subproject', () => {
    expect(getSubproject('client/tests/services/analyzer/analyzer.integration.test.js')).toBe('client');
    expect(getSubproject('server/src/app.js')).toBe('server');
  });

  test('identifies monorepo package dirs (packages/*, apps/*)', () => {
    expect(getSubproject('packages/ui/src/Button.tsx')).toBe('packages/ui');
    expect(getSubproject('apps/web/src/main.ts')).toBe('apps/web');
  });

  test('returns empty string for root project files', () => {
    expect(getSubproject('src/index.js')).toBe('');
    expect(getSubproject('lib/utils.js')).toBe('');
    expect(getSubproject('index.js')).toBe('');
    expect(getSubproject('')).toBe('');
  });
});

// ── Subproject-aware Alias Resolution ────────────────────────────────────────

describe('resolveImport — subproject-aware alias resolution', () => {
  test('resolves @/ alias from client test to client/src/ file with exact match', () => {
    const result = resolve(
      'client/tests/services/analyzer/analyzer.integration.test.js',
      '@/services/analyzer/analyzer.worker.js',
      ['client/src/services/analyzer/analyzer.worker.js']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/services/analyzer/analyzer.worker.js');
  });

  test('resolves @/ alias without file extension', () => {
    const result = resolve(
      'client/tests/components/Button.test.jsx',
      '@/components/Button',
      ['client/src/components/Button.jsx']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/components/Button.jsx');
  });

  test('resolves @/ alias pointing to index file in subproject', () => {
    const result = resolve(
      'client/tests/utils.test.js',
      '@/utils',
      ['client/src/utils/index.ts']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/utils/index.ts');
  });

  test('resolves ~/ alias in subproject', () => {
    const result = resolve(
      'client/src/features/featureA.js',
      '~/shared/helpers',
      ['client/src/shared/helpers.js']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/shared/helpers.js');
  });

  test('fallback scan in knownFiles finds file matching src/${stripped} across repo', () => {
    const result = resolve(
      'tests/integration/deep.test.js',
      '@/components/Navbar',
      ['client/src/components/Navbar.jsx']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/components/Navbar.jsx');
  });
});

// ── Scoped npm packages vs path aliases ───────────────────────────────────────

describe('resolveImport — scoped npm packages vs path aliases', () => {
  test('@scope/pkg is external', () => {
    const result = resolve('client/src/App.jsx', '@tanstack/react-query', []);
    expect(result.kind).toBe('external');
    expect(result.resolvedTo).toBeNull();
  });

  test('@org/pkg is external', () => {
    const result = resolve('server/src/server.js', '@aws-sdk/client-s3', []);
    expect(result.kind).toBe('external');
    expect(result.resolvedTo).toBeNull();
  });

  test('unresolved @/ alias returns "unresolved", NEVER "external"', () => {
    const result = resolve(
      'client/tests/services/analyzer/analyzer.integration.test.js',
      '@/nonexistent/missing.worker.js',
      ['client/src/other.js']
    );
    expect(result.kind).toBe('unresolved');
    expect(result.resolvedTo).toBeNull();
    expect(result.reason).toContain('Cannot resolve');
  });

  test('unresolved ~/ alias returns "unresolved", NEVER "external"', () => {
    const result = resolve(
      'client/src/app.js',
      '~/missing/module',
      ['client/src/other.js']
    );
    expect(result.kind).toBe('unresolved');
    expect(result.resolvedTo).toBeNull();
  });
});

// ── Multi-language Subproject-Aware Resolution ───────────────────────────────

describe('resolveImport — multi-language subproject-aware resolution', () => {
  test('Python: resolves non-relative import within subproject', () => {
    const result = resolve(
      'server/tests/test_api.py',
      'api.auth',
      ['server/api/auth.py']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('server/api/auth.py');
  });

  test('Python: resolves non-relative import to subproject src directory', () => {
    const result = resolve(
      'server/tests/test_api.py',
      'api.auth',
      ['server/src/api/auth.py']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('server/src/api/auth.py');
  });

  test('C/C++: resolves header from subproject include directory', () => {
    const result = resolve(
      'client/src/main.cpp',
      'utils/logger.h',
      ['client/include/utils/logger.h']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/include/utils/logger.h');
  });

  test('Rust: resolves crate:: module to subproject src', () => {
    const result = resolve(
      'client/src/main.rs',
      'crate::models::user',
      ['client/src/models/user.rs']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('client/src/models/user.rs');
  });

  test('Go: resolves package import to subproject directory', () => {
    const result = resolve(
      'server/cmd/main.go',
      'pkg/database',
      ['server/pkg/database.go']
    );
    expect(result.kind).toBe('internal');
    expect(result.resolvedTo).toBe('server/pkg/database.go');
  });
});

