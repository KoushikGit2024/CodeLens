/**
 * tests/analyzers/repositoryAnalyzer.test.js
 *
 * Integration tests for the repository analyzer.
 * Creates real temporary directories with source files and analyses them.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { analyzeRepository, analyzeFile, scanSourceFiles } = require('../../src/analyzers/repositoryAnalyzer');
const { SymbolKind } = require('../../src/analyzers/symbols');

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a temporary directory containing the given files.
 * Returns the directory path and a cleanup function.
 */
function createTempRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens_test_'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// ── scanSourceFiles ───────────────────────────────────────────────────────────

describe('scanSourceFiles', () => {
  test('finds JS and TS files', () => {
    const { dir, cleanup } = createTempRepo({
      'index.js': 'const x = 1;',
      'app.ts': 'const y: number = 1;',
      'style.css': 'body {}',
      'README.md': '# Hello',
    });
    try {
      const files = scanSourceFiles(dir);
      const names = files.map(f => path.basename(f));
      expect(names).toContain('index.js');
      expect(names).toContain('app.ts');
      expect(names).not.toContain('style.css');
      expect(names).not.toContain('README.md');
    } finally {
      cleanup();
    }
  });

  test('ignores node_modules', () => {
    const { dir, cleanup } = createTempRepo({
      'index.js': '',
      'node_modules/lodash/index.js': '',
    });
    try {
      const files = scanSourceFiles(dir);
      expect(files.every(f => !f.includes('node_modules'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('ignores dist/', () => {
    const { dir, cleanup } = createTempRepo({
      'src/app.js': '',
      'dist/app.js': '',
    });
    try {
      const files = scanSourceFiles(dir);
      expect(files.every(f => !f.includes('dist'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('scans nested directories', () => {
    const { dir, cleanup } = createTempRepo({
      'src/controllers/user.ts': '',
      'src/services/auth.ts': '',
      'src/index.js': '',
    });
    try {
      const files = scanSourceFiles(dir);
      expect(files).toHaveLength(3);
    } finally {
      cleanup();
    }
  });
});

// ── analyzeFile ───────────────────────────────────────────────────────────────

describe('analyzeFile', () => {
  test('analyses a JavaScript file', async () => {
    const { dir, cleanup } = createTempRepo({
      'greet.js': 'export function greet(name) { return name; }',
    });
    try {
      const absPath = path.join(dir, 'greet.js');
      const result = await analyzeFile(absPath, 'greet.js', 'javascript');
      expect(result.language).toBe('javascript');
      expect(result.error).toBeNull();
      expect(result.symbols.some(s => s.kind === SymbolKind.FUNCTION && s.name === 'greet')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('analyses a TypeScript file', async () => {
    const { dir, cleanup } = createTempRepo({
      'service.ts': 'interface IService { run(): void; }\nexport class UserService implements IService { run() {} }',
    });
    try {
      const absPath = path.join(dir, 'service.ts');
      const result = await analyzeFile(absPath, 'service.ts', 'typescript');
      expect(result.language).toBe('typescript');
      expect(result.symbols.some(s => s.kind === SymbolKind.CLASS && s.name === 'UserService')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('returns error for unreadable file without throwing', async () => {
    const result = await analyzeFile('/nonexistent/path/file.js', 'file.js', 'javascript');
    expect(result.error).toBeTruthy();
    expect(result.symbols).toHaveLength(0);
  });
});

// ── analyzeRepository ─────────────────────────────────────────────────────────

describe('analyzeRepository', () => {
  test('analyses a multi-file repository', async () => {
    const { dir, cleanup } = createTempRepo({
      'index.js': "import { greet } from './greet';\nconst result = greet('World');",
      'greet.js': 'export function greet(name) { return name; }',
      'types.ts': 'interface User { id: number; name: string; }',
    });
    try {
      const analysis = await analyzeRepository(dir);
      expect(analysis.status).toBe('ready');
      expect(analysis.totalFiles).toBe(3);
      expect(analysis.analyzedFiles).toBe(3);
      expect(analysis.errorFiles).toBe(0);
      expect(analysis.files).toHaveLength(3);
      expect(analysis.languageSummary.javascript).toBe(2);
      expect(analysis.languageSummary.typescript).toBe(1);
    } finally {
      cleanup();
    }
  });

  test('skips unsupported files', async () => {
    const { dir, cleanup } = createTempRepo({
      'app.js': 'const x = 1;',
      'style.css': 'body {}',
      'README.md': '# Readme',
    });
    try {
      const analysis = await analyzeRepository(dir);
      expect(analysis.totalFiles).toBe(1);  // only app.js counted
      expect(analysis.skippedFiles).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('one malformed file does not abort analysis of others', async () => {
    const { dir, cleanup } = createTempRepo({
      'valid.js': 'export function ok() {}',
      'broken.js': 'function ( { if if if',  // malformed
      'also-valid.ts': 'export interface Foo { bar: string; }',
    });
    try {
      const analysis = await analyzeRepository(dir);
      // All three files should appear in results
      expect(analysis.files).toHaveLength(3);
      // The broken file should have hasErrors=true but still be present
      const brokenFile = analysis.files.find(f => f.filePath.includes('broken'));
      expect(brokenFile).toBeDefined();
      expect(brokenFile.hasErrors).toBe(true);
      // The valid files should have their symbols
      const validFile = analysis.files.find(f => f.filePath.includes('valid.js'));
      expect(validFile.symbols.some(s => s.name === 'ok')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('empty repository returns ready status with 0 files', async () => {
    const { dir, cleanup } = createTempRepo({
      'README.md': '# Empty project',
      'package.json': '{}',
    });
    try {
      const analysis = await analyzeRepository(dir);
      expect(analysis.status).toBe('ready');
      expect(analysis.totalFiles).toBe(0);
      expect(analysis.files).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('result has correct shape', async () => {
    const { dir, cleanup } = createTempRepo({ 'app.js': 'const x = 1;' });
    try {
      const analysis = await analyzeRepository(dir);
      expect(analysis).toMatchObject({
        status: 'ready',
        error: null,
        analyzedAt: expect.any(String),
        totalFiles: expect.any(Number),
        analyzedFiles: expect.any(Number),
        skippedFiles: expect.any(Number),
        errorFiles: expect.any(Number),
        files: expect.any(Array),
        languageSummary: expect.any(Object),
      });
    } finally {
      cleanup();
    }
  });

  test('nonexistent directory does not throw — returns ready with 0 files', async () => {
    // _scanDir silently skips unreadable directories so an entirely missing
    // root also produces an empty-but-valid result rather than throwing.
    // This is intentional: a partial result is better than no result.
    const analysis = await analyzeRepository('/nonexistent/directory/that/does/not/exist');
    expect(analysis).toBeDefined();
    expect(analysis.totalFiles).toBe(0);
  });

  test('skips files exceeding size limit', async () => {
    const { dir, cleanup } = createTempRepo({
      'small.js': 'const x = 1;',
    });
    // Write a large file manually (> 512 KB)
    const largeContent = 'const x = ' + '1'.repeat(600 * 1024) + ';';
    fs.writeFileSync(path.join(dir, 'large.js'), largeContent);
    try {
      const analysis = await analyzeRepository(dir);
      const largeFile = analysis.files.find(f => f.filePath.includes('large'));
      expect(largeFile).toBeDefined();
      expect(largeFile.error).toMatch(/size.*exceeds/i);
    } finally {
      cleanup();
    }
  });
});
