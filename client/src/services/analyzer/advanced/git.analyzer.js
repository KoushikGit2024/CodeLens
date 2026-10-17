/**
 * git.analyzer.js
 *
 * It initiates the isomorphic-git engine, then extracts the commit history from the virtual .git folder,
 * and then it applies:
 * 1. File Churn Frequency & Normalized Churn Scores
 * 2. Temporal Co-Change Coupling via Jaccard similarity across commit boundaries
 * 3. Adam Tornhill's Behavioral Hotspot Matrix (Churn × Complexity)
 */

import git from 'isomorphic-git';
import FS from '@isomorphic-git/lightning-fs';
import * as persistenceStore from '../repository/persistence.store.js';
import { Buffer } from 'buffer';

if (typeof self !== 'undefined') {
  self.Buffer = self.Buffer || Buffer;
}

let fsInstance = null;
function getFS() {
  if (!fsInstance) {
    const fs = new FS('CodeLensGitFS');
    fsInstance = { fs, pfs: fs.promises };
  }
  return fsInstance;
}

async function ensureDir(dirPath) {
  const { pfs } = getFS();
  const parts = dirPath.split('/').filter(Boolean);
  let current = '/';
  for (const part of parts) {
    current += part + '/';
    try {
      await pfs.stat(current);
    } catch {
      await pfs.mkdir(current);
    }
  }
}

// ── Behavioral Hotspot Classification (Tornhill Matrix) ───────────────────────

export const HOTSPOT_QUADRANTS = Object.freeze({
  CRITICAL_HOTSPOT: 'CRITICAL_HOTSPOT',
  ACTIVE_DEVELOPMENT: 'ACTIVE_DEVELOPMENT',
  STABLE_LEGACY: 'STABLE_LEGACY',
  PASSIVE: 'PASSIVE',
});

/**
 * Classifies a file into one of 4 Tornhill Hotspot Quadrants based on
 * Churn and Complexity, and computes a 0–100 Hotspot Risk score.
 *
 * @param {number} churnScore - 0 to 100
 * @param {number} complexityScore - 0 to 100
 * @returns {object} { quadrant, hotspotScore, isHighChurn, isHighComplexity }
 */
export function classifyHotspot(churnScore = 0, complexityScore = 0) {
  const CHURN_THRESHOLD = 35;
  const COMPLEXITY_THRESHOLD = 35;

  const isHighChurn = churnScore >= CHURN_THRESHOLD;
  const isHighComplexity = complexityScore >= COMPLEXITY_THRESHOLD;

  let quadrant = HOTSPOT_QUADRANTS.PASSIVE;
  if (isHighChurn && isHighComplexity) {
    quadrant = HOTSPOT_QUADRANTS.CRITICAL_HOTSPOT;
  } else if (isHighChurn && !isHighComplexity) {
    quadrant = HOTSPOT_QUADRANTS.ACTIVE_DEVELOPMENT;
  } else if (!isHighChurn && isHighComplexity) {
    quadrant = HOTSPOT_QUADRANTS.STABLE_LEGACY;
  }

  // Tornhill Hotspot Risk Formula: HotspotRisk = (Churn * Complexity) / 100
  const hotspotScore = Math.min(100, Math.round((churnScore * complexityScore) / 100));

  return {
    quadrant,
    hotspotScore,
    isHighChurn,
    isHighComplexity,
  };
}

// ── Temporal Co-Change Coupling ───────────────────────────────────────────────

/**
 * Analyzes co-change patterns across commit sets to detect logical coupling.
 * Uses Jaccard similarity: J(A, B) = |C_A ∩ C_B| / |C_A ∪ C_B|
 *
 * @param {Record<string, Set<string> | string[]>} fileCommitMap - Map of filePath -> commit IDs
 * @param {number} [minShared=2] - Minimum number of commits both files must change together in
 * @param {number} [minJaccard=0.4] - Minimum Jaccard similarity threshold (0.0 to 1.0)
 * @returns {Array<object>} Array of co-change relationships sorted descending by Jaccard similarity
 */
export function computeCoChange(fileCommitMap, minShared = 2, minJaccard = 0.4) {
  if (!fileCommitMap || typeof fileCommitMap !== 'object') return [];

  // Exclude non-source, lock, and doc files from co-change pairing to avoid false noise
  const isIgnoredForCoChange = file =>
    /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.js|\.map|\.md|\.txt)$/i.test(file);

  const fileEntries = Object.entries(fileCommitMap)
    .filter(([file]) => !isIgnoredForCoChange(file))
    .map(([file, commits]) => [
      file,
      commits instanceof Set ? commits : new Set(commits),
    ]);

  const coChanges = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const [fileA, setA] = fileEntries[i];
    if (setA.size < minShared) continue;

    for (let j = i + 1; j < fileEntries.length; j++) {
      const [fileB, setB] = fileEntries[j];
      if (setB.size < minShared) continue;

      let shared = 0;
      for (const c of setA) {
        if (setB.has(c)) shared++;
      }

      if (shared >= minShared) {
        const union = setA.size + setB.size - shared;
        const jaccard = union > 0 ? shared / union : 0;

        if (jaccard >= minJaccard) {
          coChanges.push({
            fileA,
            fileB,
            sharedCommits: shared,
            jaccard: Math.round(jaccard * 100) / 100,
            commitsA: setA.size,
            commitsB: setB.size,
          });
        }
      }
    }
  }

  // Sort descending by Jaccard coefficient, then shared commits count, capped to top 50
  return coChanges
    .sort((a, b) => b.jaccard - a.jaccard || b.sharedCommits - a.sharedCommits)
    .slice(0, 50);
}

// ── Primary Engine ────────────────────────────────────────────────────────────

export async function analyzeGitChurn(repoId, postMessage = () => {}) {
  const allFiles = await persistenceStore.listFilePaths(repoId);
  const gitFiles = allFiles.filter(f => f.match(/(^|\/)\.git\//));

  if (gitFiles.length === 0) return null;

  const { fs, pfs } = getFS();
  const repoDir = `/${repoId}`;
  await ensureDir(repoDir);

  postMessage({ type: 'PROGRESS', repoId, phase: 'analyzing_git_churn', details: 'Hydrating Git filesystem…' });

  for (const filePath of gitFiles) {
    const content = await persistenceStore.loadFile(repoId, filePath);
    const pathParts = filePath.split('/');
    const dir = repoDir + '/' + pathParts.slice(0, -1).join('/');
    await ensureDir(dir);
    let encoded;
    if (content instanceof Uint8Array) {
      encoded = content;
    } else if (content && (content instanceof ArrayBuffer || content.buffer instanceof ArrayBuffer)) {
      encoded = new Uint8Array(content);
    } else {
      encoded = new TextEncoder().encode(content);
    }
    await pfs.writeFile(repoDir + '/' + filePath, encoded);
  }

  postMessage({ type: 'PROGRESS', repoId, phase: 'analyzing_git_churn', details: 'Reading commit history…' });

  let commits = [];
  let branchMap = {};
  try {
    // Manually walk history to handle shallow clone boundaries gracefully
    let currentOid = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' });
    try {
      const localBranches = await git.listBranches({ fs, dir: repoDir });
      const remoteBranches = await git.listBranches({ fs, dir: repoDir, remote: 'origin' });
      for (const b of localBranches) {
        const oid = await git.resolveRef({ fs, dir: repoDir, ref: b });
        if (!branchMap[oid]) branchMap[oid] = [];
        if (!branchMap[oid].includes(b)) branchMap[oid].push(b);
      }
      for (const b of remoteBranches) {
        const oid = await git.resolveRef({ fs, dir: repoDir, ref: `refs/remotes/origin/${b}` });
        if (!branchMap[oid]) branchMap[oid] = [];
        if (!branchMap[oid].includes(b)) branchMap[oid].push(b);
      }
    } catch (e) {
      console.warn('Could not list branches:', e);
    }
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Extract unique branch tips to start log from
    const oidsToWalk = new Set(Object.keys(branchMap));
    if (currentOid) oidsToWalk.add(currentOid);

    const commitsMap = new Map();

    for (const startOid of oidsToWalk) {
      try {
        const log = await git.log({ fs, dir: repoDir, ref: startOid, depth: 500 });
        for (const c of log) {
          if (commitsMap.has(c.oid)) continue;
          const commitTime = c.commit.author.timestamp * 1000;
          if (commitTime < ninetyDaysAgo) continue;
          commitsMap.set(c.oid, c);
        }
      } catch (e) {
        console.warn(`Could not log branch tip ${startOid}:`, e);
      }
    }

    commits = Array.from(commitsMap.values());
    // Sort reverse chronological
    commits.sort((a, b) => b.commit.author.timestamp - a.commit.author.timestamp);
  } catch (err) {
    console.error('[Git Analyzer] Failed to read git log:', err);
    return null;
  }

  if (commits.length < 2) {
    return { totalCommitsAnalyzed: 0, fileChurn: {}, churnScores: {}, coChanges: [], commits: [] };
  }

  const fileChurn = {};
  const fileCommitMap = {};
  let totalCommitsAnalyzed = 0;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    if (!commit.commit.parent || commit.commit.parent.length === 0) continue;

    // Diff against the primary parent to measure churn
    const parentOid = commit.commit.parent[0];
    totalCommitsAnalyzed++;

    try {
      const changes = await git.walk({
        fs,
        dir: repoDir,
        trees: [git.TREE({ ref: commit.oid }), git.TREE({ ref: parentOid })],
        map: async function (filepath, [A, B]) {
          if (filepath === '.') return;
          const typeA = A ? await A.type() : null;
          const typeB = B ? await B.type() : null;
          if (typeA === 'tree' || typeB === 'tree') return;

          const oidA = A ? await A.oid() : null;
          const oidB = B ? await B.oid() : null;
          if (oidA !== oidB) return filepath;
        },
      });

      const validChanges = (changes || []).filter(fp => fp && !fp.startsWith('.git/'));
      for (const filepath of validChanges) {
        if (!fileChurn[filepath]) fileChurn[filepath] = 0;
        fileChurn[filepath]++;
      }

      // Tornhill Principle: Exclude bulk commits (> 30 files) from co-change pairing
      // Mass commits (initial import, massive reformats) create false O(N^2) pairwise coupling
      const MAX_CO_CHANGE_COMMIT_FILES = 30;
      if (validChanges.length <= MAX_CO_CHANGE_COMMIT_FILES) {
        for (const filepath of validChanges) {
          if (!fileCommitMap[filepath]) fileCommitMap[filepath] = [];
          fileCommitMap[filepath].push(commit.oid);
        }
      }

      if (i % 10 === 0 || i === commits.length - 2) {
        postMessage({
          type: 'PROGRESS',
          repoId,
          phase: 'analyzing_git_churn',
          details: `Diffing commit ${i + 1} of ${commits.length - 1}…`,
        });
      }
    } catch (err) {
      console.warn(`[Git Analyzer] Failed to diff commit ${commit.oid}`, err);
    }
  }

  // Calculate normalized churn scores (0 to 100)
  const churnScores = {};
  for (const [filepath, count] of Object.entries(fileChurn)) {
    churnScores[filepath] = Math.min(100, Math.round((count / totalCommitsAnalyzed) * 100 * 3));
    // Multiplied by 3 to spread the score out a bit, since 100% of commits touching a file is rare
  }

  // Calculate temporal co-change coupling
  const coChanges = computeCoChange(fileCommitMap, totalCommitsAnalyzed >= 10 ? 3 : 2, 0.4);

  // Strip non-serializable fields if any exist
  const serializedCommits = commits.map(c => ({
    oid: c.oid,
    refs: branchMap[c.oid] || [],
    commit: {
      message: c.commit.message,
      author: c.commit.author,
      committer: c.commit.committer,
      parent: c.commit.parent,
    },
  }));

  return {
    totalCommitsAnalyzed,
    churnScores,
    fileChurn,
    coChanges,
    commits: serializedCommits,
  };
}
