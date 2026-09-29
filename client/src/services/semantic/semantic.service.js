import { loadAllFiles, loadAllEmbeddings, saveEmbedding } from '../analyzer/repository/persistence.store.js';

let worker = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./semantic.worker.js', import.meta.url), {
      type: 'module'
    });
  }
  return worker;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function initializeSemanticEngine(onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    
    const handler = (e) => {
      const { type, payload, error } = e.data;
      if (type === 'progress' && onProgress) {
        onProgress(payload);
      } else if (type === 'init_done') {
        w.removeEventListener('message', handler);
        resolve();
      } else if (type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(error));
      }
    };
    
    w.addEventListener('message', handler);
    w.postMessage({ type: 'init' });
  });
}

export async function indexRepository(repoId, onProgress) {
  return new Promise(async (resolve, reject) => {
    // 1. Fetch files from IndexedDB
    const files = await loadAllFiles(repoId);
    if (!files || files.length === 0) {
      return resolve(0);
    }

    const w = getWorker();

    const handler = async (e) => {
      const { type, current, total, embeddings, error } = e.data;
      if (type === 'index_progress' && onProgress) {
        onProgress({ current, total });
      } else if (type === 'index_done') {
        w.removeEventListener('message', handler);
        
        // 2. Save all generated embeddings to IndexedDB
        for (const emp of embeddings) {
          await saveEmbedding(emp.repoId, emp.filePath, emp.embedding);
        }
        
        resolve(embeddings.length);
      } else if (type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(error));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({ type: 'index_repo', repoId, files });
  });
}

export async function search(repoId, query) {
  return new Promise(async (resolve, reject) => {
    const w = getWorker();

    const handler = async (e) => {
      const { type, embedding, error } = e.data;
      if (type === 'search_done') {
        w.removeEventListener('message', handler);
        
        // Load all embeddings for repo
        const allEmbeddings = await loadAllEmbeddings(repoId);
        
        // Calculate similarity
        const results = allEmbeddings.map(emp => {
          const score = cosineSimilarity(embedding, emp.embedding);
          return {
            filePath: emp.filePath,
            score
          };
        });

        // Sort descending
        results.sort((a, b) => b.score - a.score);
        resolve(results.slice(0, 20)); // Return top 20
      } else if (type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(error));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({ type: 'search', query });
  });
}
