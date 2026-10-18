import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildEngineeringRiskModel } from '../../../../src/services/analyzer/advanced/risk.analyzer.js';
import * as persistenceStore from '../../../../src/services/analyzer/repository/persistence.store.js';

describe('Risk Analyzer - Git Churn & Co-Change Path Resolution', () => {
  const currentFiles = [
    { filePath: 'client/src/app/App.jsx', symbols: [{ complexity: 10 }] },
    { filePath: 'client/src/shared/api/index.js', symbols: [{ complexity: 5 }] },
    { filePath: 'client/src/features/explorer/ExplorerPage.jsx', symbols: [{ complexity: 12 }] },
    { filePath: 'server/src/server.js', symbols: [{ complexity: 2 }] },
  ];

  const graph = {
    nodes: currentFiles.map(f => ({ id: `file:${f.filePath}` })),
    edges: [],
  };

  it('resolves relocated files in gitChurn.coChanges to active repository file paths', () => {
    const analysis = {
      files: currentFiles,
      gitChurn: {
        churnScores: {},
        coChanges: [
          {
            fileA: 'client/src/App.jsx',
            fileB: 'client/src/api/index.js',
            sharedCommits: 4,
            jaccard: 1.0,
          },
        ],
      },
    };

    const model = buildEngineeringRiskModel(analysis, graph, null);
    const coChangeRisk = model.risks.find(r => r.title.includes('Hidden Logical Coupling'));

    expect(coChangeRisk).toBeDefined();
    // Path should be resolved to the active path client/src/app/App.jsx
    expect(coChangeRisk.file).toBe('client/src/app/App.jsx');
    expect(coChangeRisk.evidence.fileA).toBe('client/src/app/App.jsx');
    expect(coChangeRisk.evidence.fileB).toBe('client/src/shared/api/index.js');
    expect(coChangeRisk.evidence.coupledFiles).toEqual(['client/src/shared/api/index.js']);
    expect(coChangeRisk.evidence.originalFileA).toBe('client/src/App.jsx');
    expect(coChangeRisk.evidence.originalFileB).toBe('client/src/api/index.js');
  });

  it('omits couplings when one of the historical files was deleted from the codebase', () => {
    const analysis = {
      files: currentFiles,
      gitChurn: {
        churnScores: {},
        coChanges: [
          {
            fileA: 'client/src/App.jsx',
            fileB: 'server/src/routes/repository.js', // Deleted file!
            sharedCommits: 4,
            jaccard: 1.0,
          },
        ],
      },
    };

    const model = buildEngineeringRiskModel(analysis, graph, null);
    const deletedCoupling = model.risks.find(
      r => r.evidence?.fileB === 'server/src/routes/repository.js' || r.file === 'server/src/routes/repository.js'
    );
    expect(deletedCoupling).toBeUndefined();
  });

  it('resolves relocated files in churnTable and skips deleted files', () => {
    const analysis = {
      files: currentFiles,
      gitChurn: {
        churnScores: {
          'client/src/App.jsx': 85,
          'server/src/routes/repository.js': 90, // Deleted file!
        },
        fileChurn: {
          'client/src/App.jsx': 10,
          'server/src/routes/repository.js': 12,
        },
      },
    };

    const model = buildEngineeringRiskModel(analysis, graph, null);
    expect(model.churnTable.length).toBe(1);
    expect(model.churnTable[0].filePath).toBe('client/src/app/App.jsx');
    expect(model.churnTable[0].churnScore).toBe(85);
  });
});

describe('Persistence Store - resolveFilePath', () => {
  const repoId = 'repo-test-paths-123';

  it('resolves exact match, normalized slashes, and relocated file paths', async () => {
    await persistenceStore.saveFile(repoId, 'client/src/app/App.jsx', 'export default App;');
    await persistenceStore.saveFile(repoId, 'client/src/shared/api/index.js', 'export const api = {};');

    // 1. Exact match
    const exact = await persistenceStore.resolveFilePath(repoId, 'client/src/app/App.jsx');
    expect(exact).toBe('client/src/app/App.jsx');

    // 2. Windows backslashes
    const backslash = await persistenceStore.resolveFilePath(repoId, 'client\\src\\app\\App.jsx');
    expect(backslash).toBe('client/src/app/App.jsx');

    // 3. Relocated path: client/src/App.jsx -> client/src/app/App.jsx
    const relocated = await persistenceStore.resolveFilePath(repoId, 'client/src/App.jsx');
    expect(relocated).toBe('client/src/app/App.jsx');

    // 4. Relocated path: client/src/api/index.js -> client/src/shared/api/index.js
    const apiRelocated = await persistenceStore.resolveFilePath(repoId, 'client/src/api/index.js');
    expect(apiRelocated).toBe('client/src/shared/api/index.js');

    // 5. Deleted or non-existent file
    const deleted = await persistenceStore.resolveFilePath(repoId, 'server/src/routes/repository.js');
    expect(deleted).toBeNull();
  });
});
