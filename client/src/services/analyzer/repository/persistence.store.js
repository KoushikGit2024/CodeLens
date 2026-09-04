import { openDB } from 'idb';

const DB_NAME = 'CodeLensDB';
const DB_VERSION = 2; // Bumped for 'analysis' store separation

/**
 * Initialize IndexedDB.
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
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
      
      // Migration from version 1 to 2: Split analysis out of 'repos' store
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
}

/**
 * Save the meta information of a repository record.
 */
export async function saveMeta(record) {
  const db = await getDB();
  // Extract only meta fields, excluding analysis and chats
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
 * Save the analysis result for a repository.
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
 * Save both meta and analysis.
 */
export async function save(record) {
  await saveMeta(record);
  await saveAnalysis(record);
}

/**
 * Load a single repository record from IDB.
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
 * Load all repository records.
 */
export async function loadAll() {
  const db = await getDB();
  return await db.getAll('repos');
}

/**
 * Remove a repository and all its files from IDB.
 */
export async function remove(id) {
  const db = await getDB();
  
  // Remove repo metadata
  const txRepos = db.transaction('repos', 'readwrite');
  await txRepos.objectStore('repos').delete(id);
  await txRepos.done;
  
  // Remove analysis
  const txAnalysis = db.transaction('analysis', 'readwrite');
  await txAnalysis.objectStore('analysis').delete(id);
  await txAnalysis.done;
  
  // Remove associated files
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
 * Remove only the analysis data for a repo.
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
 * Save a file to the virtual file system.
 */
export async function saveFile(repoId, filePath, content) {
  const db = await getDB();
  await db.put('files', { repoId, filePath, content });
}

/**
 * Load a file from the virtual file system.
 */
export async function loadFile(repoId, filePath) {
  const db = await getDB();
  const file = await db.get('files', [repoId, filePath]);
  return file ? file.content : null;
}

/**
 * Load all files for a given repository.
 * Returns an array of { repoId, filePath, content }.
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
 * List all file paths for a given repository (without loading content).
 * Returns an array of strings (file paths).
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
