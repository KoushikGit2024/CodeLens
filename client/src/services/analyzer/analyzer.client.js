/**
 * analyzer.client.js
 *
 * It initializes the Web Worker bridge, then extracts asynchronous messages,
 * and then it applies Promise resolution for the main thread UI.
 */

let worker = null;
const subscribers = new Set();
const pendingResolvers = new Map();

/**
 * It evaluates the worker instance, then extracts lifecycle events,
 * and then it applies broadcast listeners for the UI subscribers.
 */
export function initWorker() {
  if (worker) return;

  worker = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = event => {
    const { type, repoId, phase, details, result, error } = event.data;

    // Broadcast ALL events (PROGRESS, COMPLETE, ERROR) to subscribers
    for (const cb of subscribers) {
      cb(event.data);
    }

    // It captures terminal events, then extracts the mapped promise resolvers, and then it applies resolve or reject logic.
    if (type === 'COMPLETE' || type === 'ERROR') {
      const resolvers = pendingResolvers.get(repoId);
      if (resolvers) {
        if (type === 'COMPLETE') resolvers.resolve(result);
        if (type === 'ERROR') resolvers.reject(new Error(error));
        pendingResolvers.delete(repoId);
      }
    }
  };

  worker.onerror = error => {
    console.error('[analyzer.client] Worker script error:', error);
    // It intercepts fatal crashes, then extracts pending UI tasks, and then it applies a global rejection to prevent hanging loading spinners.
    for (const [repoId, resolvers] of pendingResolvers.entries()) {
      resolvers.reject(new Error('Worker script crashed or failed to load. Check console for details.'));
    }
    pendingResolvers.clear();
  };

  worker.onmessageerror = error => {
    console.error('[analyzer.client] Worker message serialization error:', error);
  };
}

/**
 * It allocates a new tracking promise, then extracts the repository payload,
 * and then it applies a START message to the background worker thread.
 */
export function startAnalysis(repoId, options = {}) {
  initWorker();

  return new Promise((resolve, reject) => {
    pendingResolvers.set(repoId, { resolve, reject });
    worker.postMessage({ type: 'START_ANALYSIS', repoId, options });
  });
}

/**
 * It captures the callback reference, then extracts progress updates,
 * and then it applies them to the subscriber set for React component re-renders.
 */
export function onProgress(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * It commands the worker to halt, then extracts pending promises,
 * and then it applies rejection to cleanly free up browser memory.
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;

    for (const [repoId, resolvers] of pendingResolvers.entries()) {
      resolvers.reject(new Error('Worker terminated'));
    }
    pendingResolvers.clear();
  }
}
