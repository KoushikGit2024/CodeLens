'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { analyzeRepository } = require('../../src/analyzers/repositoryAnalyzer');

function createTempRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codelens_incremental_test_'));
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

describe('Incremental Repository Analysis', () => {
  test('should reuse cache for unchanged files and parse modified/added files', async () => {
    // Initial state
    const { dir, cleanup } = createTempRepo({
      'index.js': 'const x = 1;',
      'app.js': 'const y = 2;',
    });

    try {
      // 1. Full Analysis
      const fullAnalysis = await analyzeRepository(dir);
      
      expect(fullAnalysis.meta.analysisVersion).toBe(1);
      expect(fullAnalysis.meta.addedFiles).toBe(2);
      expect(fullAnalysis.meta.cacheMisses).toBe(2);
      expect(fullAnalysis.meta.cacheHits).toBe(0);

      // 2. Modify one file, add another, keep one unchanged
      fs.writeFileSync(path.join(dir, 'index.js'), 'const x = 999;', 'utf8');
      fs.writeFileSync(path.join(dir, 'new.js'), 'const z = 3;', 'utf8');

      // 3. Incremental Analysis
      const incAnalysis = await analyzeRepository(dir, fullAnalysis);

      expect(incAnalysis.meta.analysisVersion).toBe(2);
      expect(incAnalysis.meta.unchangedFiles).toBe(1); // app.js
      expect(incAnalysis.meta.modifiedFiles).toBe(1); // index.js
      expect(incAnalysis.meta.addedFiles).toBe(1); // new.js
      expect(incAnalysis.meta.cacheHits).toBe(1);
      expect(incAnalysis.meta.cacheMisses).toBe(2);
      
      // 4. Verify Equivalence
      // Let's do a fresh full analysis on the new state to ensure equivalence
      const cleanAnalysis = await analyzeRepository(dir);
      
      // Remove meta because it has cache stat differences and timestamps
      // Sort files to ensure order independence and remove analyzedAt from files
      const stripMetaAndSort = (res) => {
        const { meta, analyzedAt, ...rest } = res;
        rest.files = [...rest.files].sort((a, b) => a.filePath.localeCompare(b.filePath)).map(f => {
          const { analyzedAt, ...fileRest } = f;
          return fileRest;
        });
        return rest;
      };

      expect(stripMetaAndSort(incAnalysis)).toEqual(stripMetaAndSort(cleanAnalysis));
    } finally {
      cleanup();
    }
  });

  test('should handle deleted files correctly', async () => {
    const { dir, cleanup } = createTempRepo({
      'index.js': 'const x = 1;',
      'app.js': 'const y = 2;',
    });

    try {
      const fullAnalysis = await analyzeRepository(dir);
      
      // Delete app.js
      fs.unlinkSync(path.join(dir, 'app.js'));

      const incAnalysis = await analyzeRepository(dir, fullAnalysis);
      
      expect(incAnalysis.meta.deletedFiles).toBe(1);
      expect(incAnalysis.meta.unchangedFiles).toBe(1); // index.js
      expect(incAnalysis.files.length).toBe(1);
      expect(incAnalysis.files[0].filePath).toBe('index.js');
    } finally {
      cleanup();
    }
  });
});
