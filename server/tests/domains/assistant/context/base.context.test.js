/**
 * tests/ai/contextBuilder.test.js
 *
 * Comprehensive tests for the context builder.
 *
 * All tests use synthetic analysis data — no real files, no real AI calls.
 * The buildContext() tests mock fs.readFileSync to avoid filesystem I/O.
 */

'use strict';

const {
  buildContext,
  buildPrompt,
  extractQueryTerms,
  extractSymbolNames,
  DEFAULTS,
} = require('../../../../src/domains/assistant/context/base.context');

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal RepositoryAnalysis from a descriptor array.
 *
 * Each element: { path, symbols?: [{kind, name}...], imports?: ['mod',...] }
 */
function makeAnalysis(files, extra = {}) {
  return {
    status: 'ready',
    analyzedFiles: files.length,
    languageSummary: { javascript: files.length },
    files: files.map(f => ({
      filePath: f.path,
      language: 'javascript',
      hasErrors: false,
      error: null,
      symbols: [
        ...(f.symbols || []).map(s => ({ kind: s.kind || 'function', name: s.name, location: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 } })),
        ...(f.imports || []).map(src => ({ kind: 'import', source: src, specifiers: [{ name: src, alias: null, type: 'default' }], location: null })),
      ],
    })),
    name: extra.name || 'test-repo',
  };
}

// We mock fs.readFileSync globally so buildContext() doesn't need real files
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn((absPath) => {
      // Return a predictable snippet keyed by path basename
      const base = absPath.replace(/\\/g, '/').split('/').pop();
      return `// source of ${base}\nfunction example() {}\n`;
    }),
  };
});

// ── extractQueryTerms ─────────────────────────────────────────────────────────

describe('extractQueryTerms', () => {
  test('lowercases and splits on non-word chars', () => {
    const terms = extractQueryTerms('How does Authentication Work?');
    expect(terms).toContain('authentication');
    // 'does' and 'how' are stop words — they should NOT be in the terms
    expect(terms).not.toContain('how');
  });

  test('removes stop words', () => {
    const terms = extractQueryTerms('How does the auth system work?');
    expect(terms).not.toContain('how');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('does');
    expect(terms).toContain('auth');
    expect(terms).toContain('system');
  });

  test('removes duplicates', () => {
    const terms = extractQueryTerms('auth auth auth login');
    expect(terms.filter(t => t === 'auth')).toHaveLength(1);
  });

  test('ignores very short tokens', () => {
    const terms = extractQueryTerms('What is a b c auth?');
    expect(terms.some(t => t.length < 2)).toBe(false);
  });

  test('handles empty string', () => {
    expect(extractQueryTerms('')).toEqual([]);
  });

  test('handles punctuation-only string', () => {
    expect(extractQueryTerms('??? ...')).toEqual([]);
  });
});

// ── extractSymbolNames ────────────────────────────────────────────────────────

describe('extractSymbolNames', () => {
  test('returns function and class names', () => {
    const fileAnalysis = {
      symbols: [
        { kind: 'function', name: 'login' },
        { kind: 'class', name: 'AuthService' },
        { kind: 'import', source: 'express' },
        { kind: 'export', exportType: 'named', name: 'login' },
      ],
    };
    const names = extractSymbolNames(fileAnalysis);
    expect(names).toContain('login');
    expect(names).toContain('AuthService');
    expect(names).not.toContain('express'); // imports excluded
  });

  test('returns empty array for null fileAnalysis', () => {
    expect(extractSymbolNames(null)).toEqual([]);
  });

  test('returns empty array for empty symbols', () => {
    expect(extractSymbolNames({ symbols: [] })).toEqual([]);
  });

  test('excludes symbols without names', () => {
    const fileAnalysis = { symbols: [{ kind: 'function', name: null }] };
    expect(extractSymbolNames(fileAnalysis)).toEqual([]);
  });
});

// ── buildContext — file selection ─────────────────────────────────────────────

describe('buildContext — file selection', () => {
  test('selects file whose filename matches the query', () => {
    const analysis = makeAnalysis([
      { path: 'src/authController.js', symbols: [] },
      { path: 'src/userProfile.js',    symbols: [] },
    ]);
    const ctx = buildContext(analysis, 'How does auth work?', '/fake');
    const paths = ctx.files.map(f => f.path);
    expect(paths).toContain('src/authController.js');
  });

  test('excludes files with no relevance to the query', () => {
    const analysis = makeAnalysis([
      { path: 'src/auth.js',   symbols: [{ name: 'login' }] },
      { path: 'src/logger.js', symbols: [{ name: 'log' }] },
    ]);
    const ctx = buildContext(analysis, 'How does authentication work?', '/fake');
    const paths = ctx.files.map(f => f.path);
    expect(paths).toContain('src/auth.js');
    // logger should not be selected for auth question
    expect(paths).not.toContain('src/logger.js');
  });

  test('selects file whose symbol name matches the query', () => {
    const analysis = makeAnalysis([
      { path: 'src/utils.js',   symbols: [{ name: 'login' }, { name: 'logout' }] },
      { path: 'src/helpers.js', symbols: [{ name: 'formatDate' }] },
    ]);
    const ctx = buildContext(analysis, 'show me the login function', '/fake');
    const paths = ctx.files.map(f => f.path);
    expect(paths).toContain('src/utils.js');
  });

  test('selects file whose import matches the query', () => {
    const analysis = makeAnalysis([
      { path: 'src/app.js',    imports: ['express'] },
      { path: 'src/models.js', imports: ['mongoose'] },
    ]);
    const ctx = buildContext(analysis, 'How is express configured?', '/fake');
    const paths = ctx.files.map(f => f.path);
    expect(paths).toContain('src/app.js');
  });

  test('respects maxFiles limit', () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `src/auth${i}.js`,
      symbols: [{ name: `login${i}` }],
    }));
    const analysis = makeAnalysis(files);
    const ctx = buildContext(analysis, 'How does auth work?', '/fake', { maxFiles: 3 });
    expect(ctx.files.length).toBeLessThanOrEqual(3);
  });

  test('higher-scoring files come first', () => {
    const analysis = makeAnalysis([
      { path: 'src/authService.js',    symbols: [{ name: 'login' }, { name: 'authenticate' }] },
      { path: 'src/authController.js', symbols: [{ name: 'handleAuth' }] },
    ]);
    const ctx = buildContext(analysis, 'How does authentication work?', '/fake');
    // authService has more matching symbols
    expect(ctx.files[0].score).toBeGreaterThanOrEqual(ctx.files[ctx.files.length - 1].score);
  });

  test('fallback: includes first N files when nothing matches', () => {
    const analysis = makeAnalysis([
      { path: 'src/xyz.js', symbols: [{ name: 'doStuff' }] },
      { path: 'src/abc.js', symbols: [{ name: 'doMoreStuff' }] },
    ]);
    const ctx = buildContext(analysis, 'database connection pool settings', '/fake');
    // Nothing matches 'database', 'connection', 'pool', 'settings' → fallback
    // Fallback includes at least the first file
    expect(ctx.files.length).toBeGreaterThanOrEqual(1);
    expect(ctx.files[0].reason).toMatch(/fallback/i);
  });
});

// ── buildContext — dependency expansion ───────────────────────────────────────

describe('buildContext — dependency expansion', () => {
  test('includes direct dependency of a matched file', () => {
    const analysis = makeAnalysis([
      { path: 'src/authController.js', imports: ['./authService'] },
      { path: 'src/authService.js',    imports: [] },
      { path: 'src/unrelated.js',      imports: [] },
    ]);
    const ctx = buildContext(analysis, 'How does authentication work?', '/fake');
    const paths = ctx.files.map(f => f.path);
    // authController matched by filename → authService should be pulled in
    expect(paths).toContain('src/authController.js');
    expect(paths).toContain('src/authService.js');
    expect(paths).not.toContain('src/unrelated.js');
  });
});

// ── buildContext — output shape ───────────────────────────────────────────────

describe('buildContext — output shape', () => {
  test('returns question in context', () => {
    const analysis = makeAnalysis([{ path: 'src/app.js', symbols: [] }]);
    const ctx = buildContext(analysis, 'What is this?', '/fake');
    expect(ctx.question).toBe('What is this?');
  });

  test('returns repository metadata', () => {
    const analysis = makeAnalysis([{ path: 'src/app.js' }], { name: 'my-repo' });
    const ctx = buildContext(analysis, 'test question', '/fake');
    expect(ctx.repository.name).toBe('my-repo');
    expect(ctx.repository.totalFiles).toBeGreaterThanOrEqual(1);
    expect(ctx.repository).toHaveProperty('languages');
  });

  test('each file entry has required fields', () => {
    const analysis = makeAnalysis([
      { path: 'src/auth.js', symbols: [{ name: 'login' }] },
    ]);
    const ctx = buildContext(analysis, 'How does auth work?', '/fake');
    if (ctx.files.length > 0) {
      const f = ctx.files[0];
      expect(f).toHaveProperty('path');
      expect(f).toHaveProperty('reason');
      expect(f).toHaveProperty('score');
      expect(f).toHaveProperty('symbols');
      expect(f).toHaveProperty('dependencies');
      expect(f).toHaveProperty('dependents');
      // source may be null if fs mock returns something or nothing
    }
  });

  test('returns totalSourceChars', () => {
    const analysis = makeAnalysis([{ path: 'src/app.js' }]);
    const ctx = buildContext(analysis, 'test', '/fake');
    expect(typeof ctx.totalSourceChars).toBe('number');
    expect(ctx.totalSourceChars).toBeGreaterThanOrEqual(0);
  });

  test('truncated is false when context fits within budget', () => {
    const analysis = makeAnalysis([{ path: 'src/app.js' }]);
    const ctx = buildContext(analysis, 'test', '/fake', { maxSourceChars: 100_000 });
    expect(ctx.truncated).toBe(false);
  });

  test('truncated is true when budget is exhausted', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `src/auth${i}.js`,
      symbols: [{ name: 'login' }],
    }));
    const analysis = makeAnalysis(files);
    // Set tiny budget
    const ctx = buildContext(analysis, 'How does auth login work?', '/fake', {
      maxFiles: 10,
      maxSourceChars: 5,
    });
    expect(ctx.truncated).toBe(true);
  });

  test('symbols list does not contain import symbols', () => {
    const analysis = makeAnalysis([
      { path: 'src/auth.js', symbols: [{ name: 'login' }], imports: ['express'] },
    ]);
    const ctx = buildContext(analysis, 'auth login', '/fake');
    if (ctx.files.length > 0) {
      const f = ctx.files[0];
      expect(f.symbols).not.toContain('express');
      expect(f.symbols).toContain('login');
    }
  });
});

// ── buildContext — empty/edge cases ──────────────────────────────────────────

describe('buildContext — edge cases', () => {
  test('empty repository returns context with empty files array (via fallback)', () => {
    const analysis = makeAnalysis([]);
    const ctx = buildContext(analysis, 'test question', '/fake');
    expect(ctx.files).toEqual([]);
  });

  test('does not crash on file with no symbols', () => {
    const analysis = makeAnalysis([{ path: 'src/index.js' }]);
    expect(() => buildContext(analysis, 'test', '/fake')).not.toThrow();
  });

  test('does not crash when fs.readFileSync throws', () => {
    const { readFileSync } = require('fs');
    readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const analysis = makeAnalysis([{ path: 'src/auth.js', symbols: [{ name: 'login' }] }]);
    expect(() => buildContext(analysis, 'auth', '/fake')).not.toThrow();
  });

  test('nonexistent file in extractPath returns null source', () => {
    const { readFileSync } = require('fs');
    readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const analysis = makeAnalysis([{ path: 'src/auth.js', symbols: [{ name: 'login' }] }]);
    const ctx = buildContext(analysis, 'auth', '/fake');
    if (ctx.files.length > 0) {
      expect(ctx.files[0].source).toBeNull();
    }
  });
});

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  function makeContext(overrides = {}) {
    return {
      question: 'How does auth work?',
      repository: { name: 'my-repo', totalFiles: 5, languages: { javascript: 5 } },
      files: [
        {
          path: 'src/auth.js',
          reason: 'filename matches "auth"',
          score: 3,
          symbols: ['login', 'logout'],
          dependencies: ['src/models/User.js'],
          dependents: [],
          source: 'function login() {}',
        },
      ],
      totalSourceChars: 20,
      truncated: false,
      ...overrides,
    };
  }

  test('contains the question', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('How does auth work?');
  });

  test('contains the repository name', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('my-repo');
  });

  test('contains the file path', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('src/auth.js');
  });

  test('contains the source snippet', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('function login()');
  });

  test('contains symbol names', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('login');
    expect(prompt).toContain('logout');
  });

  test('contains grounding rules (no fabrication instruction)', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toMatch(/do not invent/i);
  });

  test('instructs to reference files with [path] format', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain('[path');
  });

  test('mentions truncation warning when truncated is true', () => {
    const prompt = buildPrompt(makeContext({ truncated: true }));
    expect(prompt).toMatch(/truncated/i);
  });

  test('does not mention truncation when truncated is false', () => {
    const prompt = buildPrompt(makeContext({ truncated: false }));
    expect(prompt).not.toMatch(/Note: context was truncated/i);
  });

  test('handles empty files list gracefully', () => {
    const ctx = makeContext({ files: [] });
    const prompt = buildPrompt(ctx);
    expect(prompt).toContain('No relevant source files');
  });

  test('ends with "Answer:" prompt', () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt.trimEnd()).toMatch(/Answer:\s*$/);
  });
});
