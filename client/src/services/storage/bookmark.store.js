export const BOOKMARKS_STORAGE_KEY = 'codelens_bookmarks';

/**
 * Gets all bookmarks from localStorage
 * Format: { [repoId]: { [filePath]: { note: string, bookmarkedAt: string } } }
 */
const getAllBookmarks = () => {
  try {
    const data = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to parse bookmarks from localStorage', error);
    return {};
  }
};

/**
 * Saves all bookmarks to localStorage
 */
const saveAllBookmarks = (data) => {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save bookmarks to localStorage', error);
  }
};

/**
 * Get all bookmarks for a specific repository
 */
export const getBookmarks = (repoId) => {
  if (!repoId) return {};
  const allBookmarks = getAllBookmarks();
  return allBookmarks[repoId] || {};
};

/**
 * Get a specific bookmark
 */
export const getBookmark = (repoId, filePath) => {
  if (!repoId || !filePath) return null;
  const repoBookmarks = getBookmarks(repoId);
  return repoBookmarks[filePath] || null;
};

/**
 * Check if a file is bookmarked
 */
export const isBookmarked = (repoId, filePath) => {
  return !!getBookmark(repoId, filePath);
};

/**
 * Add a bookmark
 */
export const addBookmark = (repoId, filePath, note = '') => {
  if (!repoId || !filePath) return;
  
  const allBookmarks = getAllBookmarks();
  if (!allBookmarks[repoId]) {
    allBookmarks[repoId] = {};
  }
  
  allBookmarks[repoId][filePath] = {
    note,
    bookmarkedAt: new Date().toISOString()
  };
  
  saveAllBookmarks(allBookmarks);
  
  // Dispatch a custom event so UI components can re-render if needed
  window.dispatchEvent(new CustomEvent('codelens-bookmarks-updated', {
    detail: { repoId, filePath, action: 'add' }
  }));
};

/**
 * Remove a bookmark
 */
export const removeBookmark = (repoId, filePath) => {
  if (!repoId || !filePath) return;
  
  const allBookmarks = getAllBookmarks();
  if (!allBookmarks[repoId] || !allBookmarks[repoId][filePath]) {
    return; // Doesn't exist
  }
  
  delete allBookmarks[repoId][filePath];
  saveAllBookmarks(allBookmarks);
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('codelens-bookmarks-updated', {
    detail: { repoId, filePath, action: 'remove' }
  }));
};

/**
 * Remove multiple bookmarks
 */
export const removeBookmarks = (repoId, filePaths) => {
  if (!repoId || !filePaths || !filePaths.length) return;
  
  const allBookmarks = getAllBookmarks();
  if (!allBookmarks[repoId]) return;
  
  let changed = false;
  for (const filePath of filePaths) {
    if (allBookmarks[repoId][filePath]) {
      delete allBookmarks[repoId][filePath];
      changed = true;
    }
  }
  
  if (changed) {
    saveAllBookmarks(allBookmarks);
    window.dispatchEvent(new CustomEvent('codelens-bookmarks-updated', {
      detail: { repoId, action: 'removeBatch' }
    }));
  }
};

/**
 * Update note for an existing bookmark
 */
export const updateNote = (repoId, filePath, note) => {
  if (!repoId || !filePath) return;
  
  const allBookmarks = getAllBookmarks();
  if (!allBookmarks[repoId] || !allBookmarks[repoId][filePath]) {
    return; // Cannot update a non-existent bookmark
  }
  
  allBookmarks[repoId][filePath].note = note;
  saveAllBookmarks(allBookmarks);
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('codelens-bookmarks-updated', {
    detail: { repoId, filePath, action: 'update' }
  }));
};

/**
 * Clear all bookmarks for a repository
 */
export const clearRepoBookmarks = (repoId) => {
  if (!repoId) return;
  const allBookmarks = getAllBookmarks();
  if (allBookmarks[repoId]) {
    delete allBookmarks[repoId];
    saveAllBookmarks(allBookmarks);
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('codelens-bookmarks-updated', {
      detail: { repoId, action: 'clear' }
    }));
  }
};

import { useState, useEffect } from 'react';

/**
 * React hook to get a specific bookmark and listen for updates
 */
export const useBookmark = (repoId, filePath) => {
  const [bookmark, setBookmark] = useState(() => getBookmark(repoId, filePath));

  useEffect(() => {
    setBookmark(getBookmark(repoId, filePath));
    
    const handler = (e) => {
      if (e.detail.repoId === repoId && e.detail.filePath === filePath) {
        setBookmark(getBookmark(repoId, filePath));
      }
    };
    
    window.addEventListener('codelens-bookmarks-updated', handler);
    return () => window.removeEventListener('codelens-bookmarks-updated', handler);
  }, [repoId, filePath]);

  return bookmark;
};

/**
 * React hook to get all bookmarks for a repository and listen for updates
 */
export const useBookmarksList = (repoId) => {
  const [bookmarks, setBookmarks] = useState(() => getBookmarks(repoId));

  useEffect(() => {
    setBookmarks(getBookmarks(repoId));
    
    const handler = (e) => {
      if (e.detail.repoId === repoId) {
        setBookmarks(getBookmarks(repoId));
      }
    };
    
    window.addEventListener('codelens-bookmarks-updated', handler);
    return () => window.removeEventListener('codelens-bookmarks-updated', handler);
  }, [repoId]);

  return bookmarks;
};
