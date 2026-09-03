/**
 * analyzer.client.js
 * 
 * Provides a Promise-based API for the main thread to interact with the analyzer worker.
 */

let worker = null;
const subscribers = new Set();
const pendingResolvers = new Map(); // repoId -> { resolve, reject }

export function initWorker() {
  if (worker) return;
  // Initialize the worker using Vite's Web Worker syntax
  worker = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' });
  
  worker.onmessage = (event) => {
    const { type, repoId, phase, details, result, error } = event.data;
    
    // Broadcast progress to all subscribers
    if (type === 'PROGRESS') {
      for (const cb of subscribers) {
        cb(repoId, phase, details);
      }
    }
    
    // Resolve/reject the pending Promise for this repo
    if (type === 'COMPLETE' || type === 'ERROR') {
      const resolvers = pendingResolvers.get(repoId);
      if (resolvers) {
        if (type === 'COMPLETE') resolvers.resolve(result);
        if (type === 'ERROR') resolvers.reject(new Error(error));
        pendingResolvers.delete(repoId);
      }
    }
  };
}

/**
 * Start the analysis process for a repository.
 * 
 * @param {string} repoId 
 * @param {Object} options 
 * @returns {Promise<Object>} Resolves with the final RepositoryAnalysis object when complete.
 */
export function startAnalysis(repoId, options = {}) {
  initWorker();
  
  return new Promise((resolve, reject) => {
    pendingResolvers.set(repoId, { resolve, reject });
    worker.postMessage({ type: 'START_ANALYSIS', repoId, options });
  });
}

/**
 * Subscribe to progress updates for any running analysis.
 * 
 * @param {Function} callback (repoId, phase, details)
 * @returns {Function} Unsubscribe function
 */
export function onProgress(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Terminate the worker (useful for cleanup on unmount, or interrupting).
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    
    // Reject all pending
    for (const [repoId, resolvers] of pendingResolvers.entries()) {
      resolvers.reject(new Error('Worker terminated'));
    }
    pendingResolvers.clear();
  }
}
