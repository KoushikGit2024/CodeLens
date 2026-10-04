/**
 * git.analyzer.js
 *
 * It initiates the isomorphic-git engine, then extracts the commit history from the virtual .git folder,
 * and then it applies a churn score to each file based on its modification frequency.
 */

import git from 'isomorphic-git';
import FS from '@isomorphic-git/lightning-fs';
import * as persistenceStore from '../repository/persistence.store.js';
import { Buffer } from 'buffer';

if (typeof self !== 'undefined') {
  self.Buffer = self.Buffer || Buffer;
}

const fs = new FS('CodeLens-Git-FS');
const pfs = fs.promises;

async function ensureDir(dirPath) {
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

export async function analyzeGitChurn(repoId, postMessage = () => {}) {
  const allFiles = await persistenceStore.listFilePaths(repoId);
  const gitFiles = allFiles.filter(f => f.match(/(^|\/)\.git\//));

  if (gitFiles.length === 0) return null;

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
    return { fileChurn: {}, churnScores: {}, commits: [] };
  }

  const fileChurn = {};
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

      for (const filepath of changes) {
        if (!filepath) continue;
        if (!fileChurn[filepath]) fileChurn[filepath] = 0;
        fileChurn[filepath]++;
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

  return { totalCommitsAnalyzed, churnScores, fileChurn, commits: serializedCommits };
}
