import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGitChurn } from '../../../../src/services/analyzer/advanced/git.analyzer';
import git from 'isomorphic-git';

vi.mock('isomorphic-git', () => ({
  default: {
    log: vi.fn(),
    walk: vi.fn(),
    TREE: vi.fn()
  }
}));

describe('git.analyzer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty churn data if repo is missing .git folder', async () => {
    // mock no commits
    git.log.mockRejectedValue(new Error('no git repo'));
    
    const result = await analyzeGitChurn('repo-123', {});
    expect(result.fileChurn).toEqual({});
    expect(result.churnScores).toEqual({});
  });

  it('calculates churn accurately from commit history', async () => {
    // mock git log
    git.log.mockResolvedValue([
      { oid: 'commit1' },
      { oid: 'commit2' },
      { oid: 'commit3' }
    ]);

    // First diff: commit1 -> commit2 (fileA changed)
    git.walk
      .mockResolvedValueOnce(['fileA.js'])
      // Second diff: commit2 -> commit3 (fileA, fileB changed)
      .mockResolvedValueOnce(['fileA.js', 'fileB.js']);

    const result = await analyzeGitChurn('repo-123', {});
    
    // Total diffs = 2
    // fileA changed 2 times -> score = (2/2) * 100 = 100
    // fileB changed 1 time -> score = (1/2) * 100 = 50
    expect(result.fileChurn['fileA.js']).toBe(2);
    expect(result.fileChurn['fileB.js']).toBe(1);
    
    expect(result.churnScores['fileA.js']).toBe(100);
    expect(result.churnScores['fileB.js']).toBe(50);
  });
});
