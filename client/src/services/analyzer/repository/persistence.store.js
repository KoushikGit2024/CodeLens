/**
 * persistence.store.js
 *
 * It initiates the browser's native IndexedDB, then extracts asynchronous data layers,
 * and then it applies CRUD operations to persist repository ASTs entirely client-side.
 */

import { openDB } from 'idb';

const DB_NAME = 'CodeLensDB';
const DB_VERSION = 6; // bumped: adds ignored_risks store

/**
 * It requests an IndexedDB connection, then extracts object store requirements,
 * and then it applies version-safe schema upgrades.
 */
let cachedDBPromise = null;

export async function getDB() {
  const env = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : null;
  if (!env || !env.indexedDB) {
    throw new Error('IndexedDB is not supported or is blocked in this environment.');
  }

  if (cachedDBPromise) {
    return cachedDBPromise;
  }

  // Promise race to prevent silent hangs in iframes / private mode where openDB never resolves
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            'IndexedDB initialization timed out. This is usually caused by browser privacy settings or opening the app in an iframe (e.g., Vercel Preview).'
          )
        ),
      3000
    );
  });

  const dbPromise = openDB(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('repos')) {
        db.createObjectStore('repos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: ['repoId', 'filePath'] });
      }
      if (!db.objectStoreNames.contains('analysis')) {
        db.createObjectStore('analysis', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chatSessions')) {
        db.createObjectStore('chatSessions', { keyPath: ['repoId', 'feature'] });
      }
      // v4: deterministic AI artifact cache
      if (!db.objectStoreNames.contains('aiArtifacts')) {
        db.createObjectStore('aiArtifacts', { keyPath: 'cacheKey' });
      }
      // v5: Semantic search embeddings
      if (!db.objectStoreNames.contains('embeddings')) {
        db.createObjectStore('embeddings', { keyPath: ['repoId', 'filePath'] });
      }
      // v6: Persistent risk ignore list
      if (!db.objectStoreNames.contains('ignored_risks')) {
        db.createObjectStore('ignored_risks', { keyPath: ['repoId', 'riskId'] });
      }

      if (oldVersion < 2 && db.objectStoreNames.contains('repos')) {
        const repoStore = transaction.objectStore('repos');
        const analysisStore = transaction.objectStore('analysis');
        let cursor = await repoStore.openCursor();
        while (cursor) {
          const record = cursor.value;
          if (record.analysis) {
            await analysisStore.put({ id: record.id, analysis: record.analysis });
            delete record.analysis;
            await cursor.update(record);
          }
          cursor = await cursor.continue();
        }
      }
    },

    /**
     * It detects that another tab is blocking the version upgrade, then extracts
     * the stale tab scenario, and then it applies a hard reload to unblock the upgrade.
     * This fires in the NEW tab when an OLD tab still holds an older DB connection open.
     */
    blocked(currentVersion, blockedVersion, event) {
      console.warn(
        `[CodeLens] IndexedDB upgrade from v${currentVersion} to v${blockedVersion} is blocked by another tab. ` +
          'Reloading to apply the latest schema...'
      );
      // Give the user a moment to see any pending work, then reload
      setTimeout(() => window.location.reload(), 1500);
    },

    /**
     * It detects that this tab is the stale one holding an older connection open,
     * then extracts the blocking scenario, and then it closes this connection so
     * the newer tab can upgrade successfully.
     */
    blocking(currentVersion, blockedVersion, event) {
      console.warn(`[CodeLens] This tab is blocking a DB upgrade to v${blockedVersion}. Closing connection.`);
      // Close our connection — the IDB upgrade in the other tab will then proceed
      event.target.close();
      cachedDBPromise = null;
    },
  });

  cachedDBPromise = Promise.race([dbPromise, timeoutPromise]);
  return cachedDBPromise;
}

/**
 * It reads the overarching record, then extracts lightweight metadata,
 * and then it applies a storage put operation to save status flags.
 */
export async function saveMeta(record) {
  const db = await getDB();
  const meta = {
    id: record.id,
    name: record.name,
    uploadedAt: record.uploadedAt,
    status: record.status,
    phase: record.phase,
    phaseDetails: record.phaseDetails,
    error: record.error,
    analysisVersion: record.analysisVersion,
  };

  const tx = db.transaction('repos', 'readwrite');
  const store = tx.objectStore('repos');
  const existing = (await store.get(record.id)) || {};
  await store.put({ ...existing, ...meta });
  await tx.done;
}

/**
 * It checks for analysis payloads, then extracts the AST JSON,
 * and then it applies it to the dedicated analysis storage table.
 */
export async function saveAnalysis(record) {
  if (!record.analysis) return;
  const db = await getDB();
  const tx = db.transaction('analysis', 'readwrite');
  const store = tx.objectStore('analysis');
  await store.put({ id: record.id, analysis: record.analysis });
  await tx.done;
}

/**
 * It intercepts save calls, then extracts meta and analysis fragments,
 * and then it applies them sequentially to the database.
 */
export async function save(record) {
  await saveMeta(record);
  await saveAnalysis(record);
}

/**
 * It targets a specific repository ID, then extracts the metadata and heavy AST payload,
 * and then it applies a unified object reconstruction.
 */
export async function load(id) {
  const db = await getDB();
  const meta = await db.get('repos', id);
  if (!meta) return null;

  const analysisDoc = await db.get('analysis', id);
  if (analysisDoc && analysisDoc.analysis) {
    meta.analysis = analysisDoc.analysis;
  }
  return meta;
}

/**
 * It queries the repos table, then extracts all stored configurations,
 * and then it applies a flat array return.
 */
export async function loadAll() {
  const db = await getDB();
  return await db.getAll('repos');
}

/**
 * It initiates multiple write transactions, then extracts matching keys across all stores,
 * and then it applies deletion commands to wipe a repository cleanly.
 */
export async function remove(id) {
  const db = await getDB();

  const txRepos = db.transaction('repos', 'readwrite');
  await txRepos.objectStore('repos').delete(id);
  await txRepos.done;

  const txAnalysis = db.transaction('analysis', 'readwrite');
  await txAnalysis.objectStore('analysis').delete(id);
  await txAnalysis.done;

  const txFiles = db.transaction('files', 'readwrite');
  const store = txFiles.objectStore('files');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === id) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await txFiles.done;

  const txEmbeddings = db.transaction('embeddings', 'readwrite');
  const embedStore = txEmbeddings.objectStore('embeddings');
  let embedCursor = await embedStore.openCursor();
  while (embedCursor) {
    if (embedCursor.key[0] === id) {
      await embedCursor.delete();
    }
    embedCursor = await embedCursor.continue();
  }
  await txEmbeddings.done;
}

/**
 * It targets the analysis store, then extracts the specified ID payload,
 * and then it applies deletion to clear large AST data without losing metadata.
 */
export async function removeAnalysis(id) {
  const db = await getDB();
  const tx = db.transaction('analysis', 'readwrite');
  const store = tx.objectStore('analysis');
  await store.delete(id);
  await tx.done;
}

// ── File Storage API ──────────────────────────────────────────────────────────

/**
 * It receives source code, then extracts the repository and file path bounds,
 * and then it applies an IndexedDB insertion for the virtual file system.
 */
export async function saveFile(repoId, filePath, content) {
  const db = await getDB();
  await db.put('files', { repoId, filePath, content });
}

/**
 * It queries the file store, then extracts the specific text buffer,
 * and then it applies a string return or null fallback.
 */
export async function loadFile(repoId, filePath) {
  const db = await getDB();
  const file = await db.get('files', [repoId, filePath]);
  return file ? file.content : null;
}

/**
 * It accesses the files table, then extracts all records matching the repoId,
 * and then it applies them into a complete source code array.
 */
export async function loadAllFiles(repoId) {
  const db = await getDB();
  const tx = db.transaction('files', 'readonly');
  const store = tx.objectStore('files');
  const files = [];
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      files.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return files;
}

/**
 * It traverses the file cursor, then extracts just the file path string keys,
 * and then it applies them to a lightweight directory manifest.
 */
export async function listFilePaths(repoId) {
  const db = await getDB();
  const tx = db.transaction('files', 'readonly');
  const store = tx.objectStore('files');
  const paths = [];
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      paths.push(cursor.key[1]);
    }
    cursor = await cursor.continue();
  }
  return paths;
}

// ── Embeddings API ────────────────────────────────────────────────────────────

export async function saveEmbedding(repoId, filePath, chunksOrEmbedding) {
  const db = await getDB();
  // Support both old flat embedding array and new chunks array
  if (Array.isArray(chunksOrEmbedding) && chunksOrEmbedding[0]?.embedding) {
    await db.put('embeddings', { repoId, filePath, chunks: chunksOrEmbedding });
  } else {
    await db.put('embeddings', { repoId, filePath, embedding: Array.from(chunksOrEmbedding) });
  }
}

export async function loadAllEmbeddings(repoId) {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readonly');
  const store = tx.objectStore('embeddings');
  const embeddings = [];
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      embeddings.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return embeddings;
}

export async function removeEmbeddings(repoId) {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');
  const store = tx.objectStore('embeddings');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function clearEmbeddings(repoId) {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');
  const store = tx.objectStore('embeddings');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── Ignored Risks API ──────────────────────────────────────────────────────────

/**
 * It receives a repository ID and a risk ID, then extracts the ignored_risks store,
 * and then it persists the ignore record so it survives re-analyses.
 */
export async function ignoreRisk(repoId, riskId) {
  const db = await getDB();
  await db.put('ignored_risks', { repoId, riskId, ignoredAt: Date.now() });
}

/**
 * It receives a repository ID and a risk ID, then extracts the matching record,
 * and then it applies deletion so the risk is treated as active again.
 */
export async function restoreRisk(repoId, riskId) {
  const db = await getDB();
  await db.delete('ignored_risks', [repoId, riskId]);
}

/**
 * It queries the ignored_risks store for the given repo, then extracts all records,
 * and then it returns a plain array of risk ID strings.
 */
export async function getIgnoredRiskIds(repoId) {
  const db = await getDB();
  const tx = db.transaction('ignored_risks', 'readonly');
  const store = tx.objectStore('ignored_risks');
  const results = [];
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.key[0] === repoId) {
      results.push(cursor.value.riskId);
    }
    cursor = await cursor.continue();
  }
  return results;
}
