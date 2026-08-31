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
      const [repoRes, treeRes] = await Promise.all([
        repositoryApi.get(repoId),
        repositoryApi.listFiles(repoId)
      ]);
      setRepo(repoRes.data);
      setFileTree(treeRes.data.tree);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    fetchRepo();
  }, [fetchRepo]);

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
