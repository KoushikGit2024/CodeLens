/**
 * git.analyzer.js
 *
 * It initiates the isomorphic-git engine, then extracts the commit history from the virtual .git folder,
 * and then it applies a churn score to each file based on its modification frequency.
 */

import git from 'isomorphic-git';
import FS from '@isomorphic-git/lightning-fs';
import * as persistenceStore from '../repository/persistence.store.js';

const fs = new FS('CodeLens-Git-FS');
const pfs = fs.promises;

async function ensureDir(dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '/';
  for (const part of parts) {
    current += part + '/';
    try { await pfs.stat(current); } catch { await pfs.mkdir(current); }
  }
}

export async function analyzeGitChurn(repoId) {
  const allFiles = await persistenceStore.listFilePaths(repoId);
  const gitFiles = allFiles.filter(f => f.startsWith('.git/'));

  if (gitFiles.length === 0) return null;

  const repoDir = `/${repoId}`;
  await ensureDir(repoDir);

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

  let commits = [];
  try {
    // Manually walk history to handle shallow clone boundaries gracefully
    let currentOid = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' });
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    
    for (let i = 0; i < 500; i++) {
      try {
        const commit = await git.readCommit({ fs, dir: repoDir, oid: currentOid });
        commits.push(commit);
        
        const commitTime = commit.commit.author.timestamp * 1000;
        if (commitTime < ninetyDaysAgo) break;
        
        if (commit.commit.parent && commit.commit.parent.length > 0) {
          currentOid = commit.commit.parent[0];
        } else {
          break; // End of history
        }
      } catch (e) {
        if (e.code === 'NotFoundError') {
          // Reached shallow boundary - silently break
          break;
        }
        throw e;
      }
    }
  } catch (err) {
    console.error('[Git Analyzer] Failed to read git log:', err);
    return null;
  }

  if (commits.length < 2) {
    return { fileChurn: {}, churnScores: {} };
  }

  const fileChurn = {};
  let totalCommitsAnalyzed = 0;

  for (let i = 0; i < commits.length - 1; i++) {
    const commit = commits[i];
    const parent = commits[i + 1];
    totalCommitsAnalyzed++;

    try {
      const changes = await git.walk({
        fs,
        dir: repoDir,
        trees: [git.TREE({ ref: commit.oid }), git.TREE({ ref: parent.oid })],
        map: async function(filepath, [A, B]) {
          if (filepath === '.') return;
          const typeA = A ? await A.type() : null;
          const typeB = B ? await B.type() : null;
          if (typeA === 'tree' || typeB === 'tree') return;
          
          const oidA = A ? await A.oid() : null;
          const oidB = B ? await B.oid() : null;
          if (oidA !== oidB) return filepath;
        }
      });
      
      for (const filepath of changes) {
        if (!filepath) continue;
        if (!fileChurn[filepath]) fileChurn[filepath] = 0;
        fileChurn[filepath]++;
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

  return { totalCommitsAnalyzed, churnScores, fileChurn };
}
