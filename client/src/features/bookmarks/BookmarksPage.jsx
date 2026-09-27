import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bookmark, File, Trash2, Code2, Search, CheckSquare, Square } from 'lucide-react';
import { useBookmarksList, removeBookmark, removeBookmarks, updateNote } from '../../services/storage/bookmark.store';
import { useRepository } from '../../shared/context/RepositoryContext';

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() 
          ? <span key={i} className="bg-accent/40 text-white font-semibold rounded-sm px-0.5">{part}</span> 
          : part
      )}
    </>
  );
}

export default function BookmarksPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { repo } = useRepository();
  const bookmarksMap = useBookmarksList(repoId);
  const [editingPath, setEditingPath] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaths, setSelectedPaths] = useState(new Set());

  // Convert map to sorted array (newest first) and filter by search query
  const bookmarks = useMemo(() => {
    let list = Object.entries(bookmarksMap).map(([filePath, data]) => ({ filePath, ...data }));
    
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.filePath.toLowerCase().includes(lowerQuery) || 
        (b.note && b.note.toLowerCase().includes(lowerQuery))
      );
    }
    
    return list.sort((a, b) => new Date(b.bookmarkedAt) - new Date(a.bookmarkedAt));
  }, [bookmarksMap, searchQuery]);

  const handleGoToFile = (filePath) => {
    navigate(`/explore/${repoId}/source?path=${encodeURIComponent(filePath)}`);
  };

  const handleRemove = (filePath) => {
    removeBookmark(repoId, filePath);
    if (editingPath === filePath) setEditingPath(null);
    if (selectedPaths.has(filePath)) {
      const newSet = new Set(selectedPaths);
      newSet.delete(filePath);
      setSelectedPaths(newSet);
    }
  };

  const handleMassDelete = () => {
    if (selectedPaths.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedPaths.size} selected bookmarks?`)) {
      removeBookmarks(repoId, Array.from(selectedPaths));
      setSelectedPaths(new Set());
      setEditingPath(null);
    }
  };

  const toggleSelection = (filePath) => {
    const newSet = new Set(selectedPaths);
    if (newSet.has(filePath)) {
      newSet.delete(filePath);
    } else {
      newSet.add(filePath);
    }
    setSelectedPaths(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === bookmarks.length && bookmarks.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(bookmarks.map(b => b.filePath)));
    }
  };

  const startEditing = (bookmark) => {
    setEditingPath(bookmark.filePath);
    setEditNote(bookmark.note || '');
  };

  const saveNote = (filePath) => {
    updateNote(repoId, filePath, editNote);
    setEditingPath(null);
  };

  const isAllSelected = bookmarks.length > 0 && selectedPaths.size === bookmarks.length;

  return (
    <div className="flex-1 bg-surface h-full flex flex-col overflow-hidden">
      <div className="px-8 py-6 border-b border-border bg-panel shrink-0">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-accent" />
              Bookmarks & Notes
            </h1>
            <p className="text-sm text-muted mt-1">
              {repo ? `Manage pinned files and notes for ${repo.name}` : 'Manage your pinned files'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-72">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-border rounded-md pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        </div>
        
        {/* Bulk actions bar */}
        {(bookmarks.length > 0 || searchQuery) && (
          <div className="mt-6 flex items-center justify-between">
            <button 
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
            >
              {isAllSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4" />}
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
            
            {selectedPaths.size > 0 && (
              <button 
                onClick={handleMassDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger rounded hover:bg-danger/20 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedPaths.size})
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {Object.keys(bookmarksMap).length === 0 ? (
            <div className="text-center py-20 bg-panel/30 border border-border rounded-lg border-dashed">
              <Bookmark className="w-12 h-12 text-muted opacity-30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No bookmarks yet</h3>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Pin important files from the Explorer to keep track of them here and add personal notes.
              </p>
              <button 
                onClick={() => navigate(`/explore/${repoId}/source`)}
                className="mt-6 px-4 py-2 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors text-sm font-medium"
              >
                Go to Explorer
              </button>
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted">No bookmarks match your search.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {bookmarks.map(bookmark => (
                <div 
                  key={bookmark.filePath} 
                  className={`bg-panel border rounded-lg p-5 flex flex-col gap-4 group transition-colors shadow-sm ${
                    selectedPaths.has(bookmark.filePath) ? 'border-accent/50' : 'border-border hover:border-accent/30'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0 flex items-start gap-3">
                      <button 
                        onClick={() => toggleSelection(bookmark.filePath)}
                        className="mt-0.5 text-muted hover:text-white transition-colors"
                      >
                        {selectedPaths.has(bookmark.filePath) 
                          ? <CheckSquare className="w-5 h-5 text-accent" /> 
                          : <Square className="w-5 h-5" />
                        }
                      </button>
                      <div className="mt-1 p-1.5 bg-surface rounded text-accent shrink-0">
                        <File className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleGoToFile(bookmark.filePath)}>
                        <h3 className="text-sm font-medium text-white truncate hover:text-accent transition-colors" title={bookmark.filePath.split('/').pop()}>
                          {highlightMatch(bookmark.filePath.split('/').pop(), searchQuery)}
                        </h3>
                        <p className="text-xs text-muted truncate mt-0.5" title={bookmark.filePath}>
                          {highlightMatch(bookmark.filePath, searchQuery)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleRemove(bookmark.filePath)}
                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                        title="Remove bookmark"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleGoToFile(bookmark.filePath)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/90 transition-colors"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        Go to File
                      </button>
                    </div>
                  </div>

                  <div className="bg-surface/50 rounded p-3 text-sm ml-8">
                    {editingPath === bookmark.filePath ? (
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="Add a note..."
                          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNote(bookmark.filePath);
                            if (e.key === 'Escape') setEditingPath(null);
                          }}
                        />
                        <button onClick={() => saveNote(bookmark.filePath)} className="px-3 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 text-xs font-medium">Save</button>
                        <button onClick={() => setEditingPath(null)} className="px-3 py-1 text-muted hover:text-white text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          {bookmark.note ? (
                            <p className="text-white/80 whitespace-pre-wrap">{highlightMatch(bookmark.note, searchQuery)}</p>
                          ) : (
                            <p className="text-muted italic opacity-50">No note added.</p>
                          )}
                        </div>
                        <button 
                          onClick={() => startEditing(bookmark)}
                          className="text-xs text-accent hover:underline shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-[10px] text-muted flex justify-end">
                    Bookmarked on {new Date(bookmark.bookmarkedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
