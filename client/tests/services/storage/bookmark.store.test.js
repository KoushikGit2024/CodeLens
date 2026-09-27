import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  getBookmarks, 
  getBookmark, 
  isBookmarked, 
  addBookmark, 
  removeBookmark, 
  updateNote,
  clearRepoBookmarks,
  BOOKMARKS_STORAGE_KEY
} from '../../../src/services/storage/bookmark.store';

describe('bookmark.store', () => {
  const mockRepoId = 'repo-123';
  const mockFilePath = 'src/App.jsx';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('adds a bookmark with a note', () => {
    addBookmark(mockRepoId, mockFilePath, 'This is a test note');
    
    const bookmark = getBookmark(mockRepoId, mockFilePath);
    expect(bookmark).not.toBeNull();
    expect(bookmark.note).toBe('This is a test note');
    expect(bookmark.bookmarkedAt).toBeDefined();
    expect(isBookmarked(mockRepoId, mockFilePath)).toBe(true);
  });

  it('removes a bookmark', () => {
    addBookmark(mockRepoId, mockFilePath, 'note');
    removeBookmark(mockRepoId, mockFilePath);
    
    expect(getBookmark(mockRepoId, mockFilePath)).toBeNull();
    expect(isBookmarked(mockRepoId, mockFilePath)).toBe(false);
  });

  it('updates a note for an existing bookmark', () => {
    addBookmark(mockRepoId, mockFilePath, 'old note');
    updateNote(mockRepoId, mockFilePath, 'new note');
    
    const bookmark = getBookmark(mockRepoId, mockFilePath);
    expect(bookmark.note).toBe('new note');
  });

  it('does nothing when updating note for non-existent bookmark', () => {
    updateNote(mockRepoId, mockFilePath, 'new note');
    expect(getBookmark(mockRepoId, mockFilePath)).toBeNull();
  });

  it('gets all bookmarks for a repo', () => {
    addBookmark(mockRepoId, 'file1.js', 'note 1');
    addBookmark(mockRepoId, 'file2.js', 'note 2');
    addBookmark('other-repo', 'file3.js', 'note 3');
    
    const bookmarks = getBookmarks(mockRepoId);
    expect(Object.keys(bookmarks)).toHaveLength(2);
    expect(bookmarks['file1.js'].note).toBe('note 1');
    expect(bookmarks['file2.js'].note).toBe('note 2');
  });

  it('clears all bookmarks for a repo', () => {
    addBookmark(mockRepoId, 'file1.js', 'note 1');
    addBookmark(mockRepoId, 'file2.js', 'note 2');
    addBookmark('other-repo', 'file3.js', 'note 3');
    
    clearRepoBookmarks(mockRepoId);
    
    expect(Object.keys(getBookmarks(mockRepoId))).toHaveLength(0);
    expect(Object.keys(getBookmarks('other-repo'))).toHaveLength(1);
  });

  it('dispatches custom events on add, remove, and update', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    
    addBookmark(mockRepoId, mockFilePath, 'note');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('codelens-bookmarks-updated');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual({ repoId: mockRepoId, filePath: mockFilePath, action: 'add' });
    
    updateNote(mockRepoId, mockFilePath, 'updated note');
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy.mock.calls[1][0].detail).toEqual({ repoId: mockRepoId, filePath: mockFilePath, action: 'update' });
    
    removeBookmark(mockRepoId, mockFilePath);
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    expect(dispatchSpy.mock.calls[2][0].detail).toEqual({ repoId: mockRepoId, filePath: mockFilePath, action: 'remove' });
  });
});
