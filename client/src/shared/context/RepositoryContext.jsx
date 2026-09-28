/**
 * RepositoryContext.jsx
 *
 * It initiates the repository state hooks, then extracts progress events via the worker, 
 * and then it applies instantaneous UI re-renders without blind polling.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { repositoryApi } from '../api';
import { onProgress } from '../../services/analyzer/analyzer.client.js';

const RepositoryContext = createContext(null);

export function RepositoryProvider({ children }) {
  const { repoId } = useParams();
  const [repo, setRepo] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [livePhase, setLivePhase] = useState(null);

  /**
   * It calls the local API, then extracts the IndexedDB repository record, 
   * and then it applies the payload to the component state.
   */
  const fetchRepo = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const repoRes = await repositoryApi.get(repoId);
      setRepo(repoRes.data);
      
      if (repoRes.data.status === 'ready') {
        try {
          const treeRes = await repositoryApi.listFiles(repoId);
          setFileTree(treeRes.data.tree);
        } catch (treeErr) {
          console.warn("Failed to fetch file tree", treeErr);
          setFileTree(null);
        }
      } else {
        setFileTree(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    fetchRepo();
  }, [fetchRepo]);

  // It intercepts the active worker status, then extracts specific progress callbacks, and then it applies them to refresh the repository data in real-time.
  useEffect(() => {
    const unsubscribe = onProgress((msg) => {
      if (msg.repoId !== repoId) return;

      // Update live phase label instantly without a DB round-trip
      if (msg.type === 'PROGRESS' && msg.phase) {
        setLivePhase({ phase: msg.phase, details: msg.details });
      }

      // Only refresh the full repo record when analysis finishes or errors out
      if (msg.type === 'COMPLETE' || msg.type === 'ERROR') {
        setLivePhase(null);
        fetchRepo();
      }
    });
    return () => unsubscribe();
  }, [repoId, fetchRepo]);

  const value = {
    repoId,
    repo,
    fileTree,
    loading,
    error,
    livePhase,
    refetchRepo: fetchRepo,
  };

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepository() {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepository must be used within a RepositoryProvider');
  }
  return context;
}