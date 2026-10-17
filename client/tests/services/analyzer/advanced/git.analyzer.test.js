import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeGitChurn,
  classifyHotspot,
  computeCoChange,
  HOTSPOT_QUADRANTS,
} from '../../../../src/services/analyzer/advanced/git.analyzer.js';
import git from 'isomorphic-git';
import * as persistenceStore from '../../../../src/services/analyzer/repository/persistence.store.js';

vi.mock('isomorphic-git', () => ({
  default: {
    log: vi.fn(),
    walk: vi.fn(),
    TREE: vi.fn(),
    resolveRef: vi.fn(),
    readCommit: vi.fn(),
    listBranches: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../../src/services/analyzer/repository/persistence.store.js', () => ({
  listFilePaths: vi.fn(),
  loadFile: vi.fn(),
}));

describe('git.analyzer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    git.listBranches.mockResolvedValue([]);
  });

  describe('classifyHotspot (Tornhill Matrix)', () => {
    it('classifies high churn + high complexity as CRITICAL_HOTSPOT', () => {
      const res = classifyHotspot(80, 75);
      expect(res.quadrant).toBe(HOTSPOT_QUADRANTS.CRITICAL_HOTSPOT);
      expect(res.hotspotScore).toBe(60); // (80 * 75) / 100
      expect(res.isHighChurn).toBe(true);
      expect(res.isHighComplexity).toBe(true);
    });

    it('classifies high churn + low complexity as ACTIVE_DEVELOPMENT', () => {
      const res = classifyHotspot(70, 15);
      expect(res.quadrant).toBe(HOTSPOT_QUADRANTS.ACTIVE_DEVELOPMENT);
      expect(res.hotspotScore).toBe(11);
      expect(res.isHighChurn).toBe(true);
      expect(res.isHighComplexity).toBe(false);
    });

    it('classifies low churn + high complexity as STABLE_LEGACY', () => {
      const res = classifyHotspot(10, 80);
      expect(res.quadrant).toBe(HOTSPOT_QUADRANTS.STABLE_LEGACY);
      expect(res.hotspotScore).toBe(8);
      expect(res.isHighChurn).toBe(false);
      expect(res.isHighComplexity).toBe(true);
    });

    it('classifies low churn + low complexity as PASSIVE', () => {
      const res = classifyHotspot(15, 20);
      expect(res.quadrant).toBe(HOTSPOT_QUADRANTS.PASSIVE);
      expect(res.hotspotScore).toBe(3);
    });
  });

  describe('computeCoChange (Jaccard Temporal Coupling)', () => {
    it('returns empty array for empty or invalid input', () => {
      expect(computeCoChange(null)).toEqual([]);
      expect(computeCoChange({})).toEqual([]);
    });

    it('calculates Jaccard index for files modified together across commits', () => {
      const fileCommitMap = {
        'src/auth.js': ['c1', 'c2', 'c3', 'c4'],
        'src/tokens.js': ['c1', 'c2', 'c3', 'c5'],
        'src/unrelated.js': ['c9'],
      };

      // auth and tokens share c1, c2, c3 (3 shared).
      // Union = {c1, c2, c3, c4, c5} (5 total).
      // Jaccard = 3 / 5 = 0.60
      const res = computeCoChange(fileCommitMap, 2, 0.4);
      expect(res).toHaveLength(1);
      expect(res[0].fileA).toBe('src/auth.js');
      expect(res[0].fileB).toBe('src/tokens.js');
      expect(res[0].sharedCommits).toBe(3);
      expect(res[0].jaccard).toBe(0.6);
    });

    it('filters out pairs below minShared or minJaccard', () => {
      const fileCommitMap = {
        'src/a.js': ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
        'src/b.js': ['c1', 'other1', 'other2'],
      };
      // Shared = 1 (< minShared 2), Jaccard = 1 / 12 = 0.08 (< 0.4)
      const res = computeCoChange(fileCommitMap, 2, 0.4);
      expect(res).toEqual([]);
    });
  });

  describe('analyzeGitChurn Engine', () => {
    it('returns null if repo is missing .git folder', async () => {
      persistenceStore.listFilePaths.mockResolvedValue(['fileA.js', 'fileB.js']);

      const result = await analyzeGitChurn('repo-123', vi.fn());
      expect(result).toBeNull();
    });

    it('calculates churn and co-changes accurately from commit history', async () => {
      persistenceStore.listFilePaths.mockResolvedValue(['.git/config', 'fileA.js', 'fileB.js']);
      persistenceStore.loadFile.mockResolvedValue(new Uint8Array(0));

      git.resolveRef.mockResolvedValue('commit3');
      git.log.mockResolvedValue([
        { oid: 'commit3', commit: { author: { timestamp: Date.now() / 1000 }, parent: ['commit2'] } },
        { oid: 'commit2', commit: { author: { timestamp: Date.now() / 1000 }, parent: ['commit1'] } },
        { oid: 'commit1', commit: { author: { timestamp: Date.now() / 1000 }, parent: [] } },
      ]);

      // Both commits touch fileA and fileB together
      git.walk
        .mockResolvedValueOnce(['fileA.js', 'fileB.js'])
        .mockResolvedValueOnce(['fileA.js', 'fileB.js']);

      const result = await analyzeGitChurn('repo-123', vi.fn());

      expect(result.fileChurn['fileA.js']).toBe(2);
      expect(result.fileChurn['fileB.js']).toBe(2);

      expect(result.churnScores['fileA.js']).toBe(100);
      expect(result.churnScores['fileB.js']).toBe(100);

      expect(result.coChanges).toBeDefined();
      expect(result.coChanges).toHaveLength(1);
      expect(result.coChanges[0].fileA).toBe('fileA.js');
      expect(result.coChanges[0].fileB).toBe('fileB.js');
      expect(result.coChanges[0].sharedCommits).toBe(2);
      expect(result.coChanges[0].jaccard).toBe(1.0);
    });
  });

  describe('Integration with buildEngineeringRiskModel', () => {
    it('generates Critical Behavioral Hotspot and Hidden Logical Coupling risks', async () => {
      const { buildEngineeringRiskModel } = await import('../../../../src/services/analyzer/advanced/risk.analyzer.js');

      const analysis = {
        files: [
          {
            filePath: 'src/hotspot.js',
            lineCount: 300,
            metrics: { complexity: 45, churnScore: 80 },
          },
          {
            filePath: 'src/coupledA.js',
            lineCount: 100,
            metrics: { complexity: 10, churnScore: 50 },
          },
          {
            filePath: 'src/coupledB.js',
            lineCount: 100,
            metrics: { complexity: 10, churnScore: 50 },
          },
        ],
        gitChurn: {
          fileChurn: {
            'src/hotspot.js': 20,
            'src/coupledA.js': 8,
            'src/coupledB.js': 8,
          },
          churnScores: {
            'src/hotspot.js': 80,
            'src/coupledA.js': 50,
            'src/coupledB.js': 50,
          },
          coChanges: [
            {
              fileA: 'src/coupledA.js',
              fileB: 'src/coupledB.js',
              sharedCommits: 8,
              jaccard: 0.8,
            },
          ],
        },
      };

      // Dependency graph without edge between coupledA and coupledB
      const graph = {
        nodes: [
          { id: 'src/hotspot.js' },
          { id: 'src/coupledA.js' },
          { id: 'src/coupledB.js' },
        ],
        edges: [],
      };

      const model = buildEngineeringRiskModel(analysis, graph, {});

      // 1. Behavioral Hotspot
      const hotspotRisk = model.risks.find(r => r.title === 'Behavioral Hotspot (Critical Active Risk)');
      expect(hotspotRisk).toBeDefined();
      expect(hotspotRisk.file).toBe('src/hotspot.js');
      expect(hotspotRisk.severity).toBe('critical');
      expect(hotspotRisk.evidence.quadrant).toBe('CRITICAL_HOTSPOT');

      // 2. Hidden Logical Coupling
      const logicalCouplingRisk = model.risks.find(r => r.title === 'Hidden Logical Coupling (Temporal Co-Change)');
      expect(logicalCouplingRisk).toBeDefined();
      expect(logicalCouplingRisk.file).toBe('src/coupledA.js');
      expect(logicalCouplingRisk.evidence.fileB).toBe('src/coupledB.js');
      expect(logicalCouplingRisk.evidence.jaccard).toBe(0.8);
      expect(logicalCouplingRisk.severity).toBe('high');
    });
  });
});
