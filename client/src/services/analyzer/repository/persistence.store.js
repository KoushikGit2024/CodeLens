/**
 * persistence.store.js
 *
 * It initiates the browser's native IndexedDB, then extracts asynchronous data layers, 
 * and then it applies CRUD operations to persist repository ASTs entirely client-side.
 */

import { openDB } from 'idb';

const DB_NAME = 'CodeLensDB';
const DB_VERSION = 3; 

/**
 * It requests an IndexedDB connection, then extracts object store requirements, 
 * and then it applies version-safe schema upgrades.
 */
export async function getDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB is not supported or is blocked in this environment.');
  }

  // Promise race to prevent silent hangs in iframes / private mode where openDB never resolves
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('IndexedDB initialization timed out. This is usually caused by browser privacy settings or opening the app in an iframe (e.g., Vercel Preview).')), 3000);
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
  });

  return Promise.race([dbPromise, timeoutPromise]);
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
  const existing = await store.get(record.id) || {};
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