import 'fake-indexeddb/auto';
import { analyzeRepository, analyzeFileContent } from '@/services/analyzer/repository/repository.analyzer.js';
import { SymbolKind } from '@/services/analyzer/parsing/symbols.js';
import { saveFile, remove } from '@/services/analyzer/repository/persistence.store.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Setup a fake repository in IndexedDB
 */
async function setupFakeRepo(repoId, files) {
  for (const [relPath, content] of Object.entries(files)) {
    await saveFile(repoId, relPath, content);
  }
  return {
    cleanup: async () => await remove(repoId),
  };
}

describe('repository.analyzer.js', () => {
  const repoId = 'test-repo';

  test('analyzes JS and TS files correctly', async () => {
    const { cleanup } = await setupFakeRepo(repoId, {
      'index.js': 'const x = 1;',
      'app.ts': 'const y: number = 1;',
      'style.css': 'body {}',
      'README.md': '# Hello',
    });

    try {
      const analysis = await analyzeRepository(repoId);
      expect(analysis.status).toBe('ready');
      expect(analysis.totalFiles).toBe(4);
      expect(analysis.analyzedFiles).toBe(2);
      expect(analysis.skippedFiles).toBe(2);
      expect(analysis.errorFiles).toBe(0);

      const names = analysis.files.map(f => f.filePath);
      expect(names).toContain('index.js');
      expect(names).toContain('app.ts');
      expect(names).not.toContain('style.css');
      expect(names).not.toContain('README.md');
    } finally {
      await cleanup();
    }
  });

  test('extracts symbols from multiple files', async () => {
    const { cleanup } = await setupFakeRepo(repoId, {
      'math.js': 'export function add(a, b) { return a + b; }',
      'main.ts': 'import { add } from "./math"; add(1, 2); class Runner {}',
    });

    try {
      const analysis = await analyzeRepository(repoId);
      expect(analysis.status).toBe('ready');

      const mathFile = analysis.files.find(f => f.filePath === 'math.js');
      expect(mathFile.symbols).toContainEqual(expect.objectContaining({ name: 'add', kind: SymbolKind.FUNCTION }));

      const mainFile = analysis.files.find(f => f.filePath === 'main.ts');
      expect(mainFile.symbols).toContainEqual(expect.objectContaining({ name: 'Runner', kind: SymbolKind.CLASS }));
      expect(mainFile.symbols).toContainEqual(expect.objectContaining({ specifiers: expect.arrayContaining([expect.objectContaining({ name: 'add' })]), kind: SymbolKind.IMPORT }));
    } finally {
      await cleanup();
    }
  });

  test('handles parse errors without failing entire repository', async () => {
    const { cleanup } = await setupFakeRepo(repoId, {
      'good.js': 'const a = 1;',
      'bad.js': 'const a = ; %%% syntax error',
    });

    try {
      const analysis = await analyzeRepository(repoId);
      expect(analysis.status).toBe('ready');
      expect(analysis.totalFiles).toBe(2);
      // Even with parse errors, Tree-sitter recovers and returns an AST with errors.
      // So the file is still 'analyzed'.
      expect(analysis.analyzedFiles).toBe(2);
      
      const badFile = analysis.files.find(f => f.filePath === 'bad.js');
      expect(badFile.error).toBeNull();
      // It might extract some symbols or none depending on recovery
    } finally {
      await cleanup();
    }
  });

  test('skips unsupported languages', async () => {
    const { cleanup } = await setupFakeRepo(repoId, {
      'unknown.go': 'package main',
      'index.js': 'let x = 1;',
    });

    try {
      const analysis = await analyzeRepository(repoId);
      expect(analysis.totalFiles).toBe(2);
      expect(analysis.analyzedFiles).toBe(1);
      expect(analysis.skippedFiles).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
