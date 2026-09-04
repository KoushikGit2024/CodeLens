import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { repositoryApi } from '../api';

const RepositoryContext = createContext(null);

export function RepositoryProvider({ children }) {
  const { repoId } = useParams();
  const [repo, setRepo] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRepo = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const repoRes = await repositoryApi.get(repoId);
      setRepo(repoRes.data);
      
      // Only attempt to fetch the file tree if the repository is fully ready.
      // If it's still analyzing, endpoints will return 409.
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

  // Polling mechanism for when the repo is actively analyzing
  useEffect(() => {
    let interval;
    if (repo && repo.status === 'analyzing') {
      interval = setInterval(async () => {
        try {
          const repoRes = await repositoryApi.get(repoId);
          setRepo(repoRes.data);
          
          if (repoRes.data.status === 'ready') {
            clearInterval(interval);
            try {
              const treeRes = await repositoryApi.listFiles(repoId);
              setFileTree(treeRes.data.tree);
            } catch (treeErr) {
              console.warn("Failed to fetch file tree", treeErr);
            }
          }
        } catch (err) {
          console.warn("Polling error", err);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [repo?.status, repoId]);

  const value = {
    repoId,
    repo,
    fileTree,
    loading,
    error,
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
