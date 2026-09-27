import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bookmark, File, Trash2, ArrowRight, Code2 } from 'lucide-react';
import { useBookmarksList, removeBookmark, updateNote } from '../../services/storage/bookmark.store';
import { useRepository } from '../../shared/context/RepositoryContext';

export default function BookmarksPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { repo } = useRepository();
  const bookmarksMap = useBookmarksList(repoId);
  const [editingPath, setEditingPath] = useState(null);
  const [editNote, setEditNote] = useState('');

  // Convert map to sorted array (newest first)
  const bookmarks = Object.entries(bookmarksMap)
    .map(([filePath, data]) => ({ filePath, ...data }))
    .sort((a, b) => new Date(b.bookmarkedAt) - new Date(a.bookmarkedAt));

  const handleGoToFile = (filePath) => {
    navigate(`/explore/${repoId}/source?path=${encodeURIComponent(filePath)}`);
  };

  const handleRemove = (filePath) => {
    removeBookmark(repoId, filePath);
    if (editingPath === filePath) setEditingPath(null);
  };

  const startEditing = (bookmark) => {
    setEditingPath(bookmark.filePath);
    setEditNote(bookmark.note || '');
  };

  const saveNote = (filePath) => {
    updateNote(repoId, filePath, editNote);
    setEditingPath(null);
  };

  return (
    <div className="flex-1 bg-surface h-full flex flex-col overflow-hidden">
      <div className="px-8 py-6 border-b border-border bg-panel shrink-0">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-accent" />
          Bookmarks & Notes
        </h1>
        <p className="text-sm text-muted mt-1">
          {repo ? `Manage pinned files and notes for ${repo.name}` : 'Manage your pinned files'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {bookmarks.length === 0 ? (
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
          ) : (
            <div className="grid gap-4">
              {bookmarks.map(bookmark => (
                <div key={bookmark.filePath} className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-4 group transition-colors hover:border-accent/40 shadow-sm">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0 flex items-start gap-3">
                      <div className="mt-0.5 p-2 bg-surface rounded text-accent shrink-0">
                        <File className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-white truncate" title={bookmark.filePath.split('/').pop()}>
                          {bookmark.filePath.split('/').pop()}
                        </h3>
                        <p className="text-xs text-muted truncate mt-0.5" title={bookmark.filePath}>
                          {bookmark.filePath}
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

                  <div className="bg-surface/50 rounded p-3 text-sm">
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
                            <p className="text-white/80 whitespace-pre-wrap">{bookmark.note}</p>
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
