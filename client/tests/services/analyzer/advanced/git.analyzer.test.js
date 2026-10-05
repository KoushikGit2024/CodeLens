import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGitChurn } from '../../../../src/services/analyzer/advanced/git.analyzer';
import git from 'isomorphic-git';
import * as persistenceStore from '../../../../src/services/analyzer/repository/persistence.store';

vi.mock('isomorphic-git', () => ({
  default: {
    log: vi.fn(),
    walk: vi.fn(),
    TREE: vi.fn(),
    resolveRef: vi.fn(),
    readCommit: vi.fn(),
  },
}));

vi.mock('../../../../src/services/analyzer/repository/persistence.store', () => ({
  listFilePaths: vi.fn(),
  loadFile: vi.fn(),
}));

describe('git.analyzer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null if repo is missing .git folder', async () => {
    persistenceStore.listFilePaths.mockResolvedValue(['fileA.js', 'fileB.js']);

    const result = await analyzeGitChurn('repo-123', vi.fn());
    expect(result).toBeNull();
  });

  it('calculates churn accurately from commit history', async () => {
    persistenceStore.listFilePaths.mockResolvedValue(['.git/config', 'fileA.js', 'fileB.js']);
    persistenceStore.loadFile.mockResolvedValue(new Uint8Array(0));

    git.resolveRef.mockResolvedValue('commit3');
    git.log.mockResolvedValue([
      { oid: 'commit3', commit: { author: { timestamp: Date.now() / 1000 }, parent: ['commit2'] } },
      { oid: 'commit2', commit: { author: { timestamp: Date.now() / 1000 }, parent: ['commit1'] } },
      { oid: 'commit1', commit: { author: { timestamp: Date.now() / 1000 }, parent: [] } },
    ]);

    // First diff: commit3 -> commit2 (fileB changed)
    git.walk
      .mockResolvedValueOnce(['fileA.js', 'fileB.js'])
      // Second diff: commit2 -> commit1 (fileA changed)
      .mockResolvedValueOnce(['fileA.js']);

    const result = await analyzeGitChurn('repo-123', vi.fn());

    expect(result.fileChurn['fileA.js']).toBe(2);
    expect(result.fileChurn['fileB.js']).toBe(1);

    expect(result.churnScores['fileA.js']).toBe(100);
    expect(result.churnScores['fileB.js']).toBe(100);
  });
});
