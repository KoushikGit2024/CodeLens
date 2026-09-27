# Bookmarks & Notes

The Bookmarks & Notes feature allows users to pin files they find interesting or important while exploring a repository, and attach personal notes to them.

## Architecture

This feature is entirely client-side and uses `localStorage` for persistence, avoiding any backend storage requirements.

### Storage Layer (`bookmark.store.js`)

The storage layer is implemented in `client/src/services/storage/bookmark.store.js`.

- **Data Structure**: `{[repoId]: {[filePath]: { note: string, bookmarkedAt: ISOString }}}`
- **Events**: It dispatches a custom `codelens-bookmarks-updated` window event whenever a bookmark is added, removed, or updated.
- **Hooks**: It exports `useBookmark` and `useBookmarksList` React hooks that automatically listen for the custom event and trigger re-renders when data changes.

### Components

1. **Source Viewer (`ExplorerPage.jsx`)**:
   - The `CodeViewer` component displays a bookmark icon button in its header.
   - When bookmarked, it shows an inline banner below the header with the note content, and provides an inline editor to add/update the note.

2. **File Tree (`FileTree.jsx`)**:
   - Displays a small bookmark indicator next to any file that is currently bookmarked.

3. **Bookmarks Page (`BookmarksPage.jsx`)**:
   - Accessible via the Repository Sidebar.
   - Lists all bookmarks for the current repository, sorted by newest first.
   - Allows users to read and edit notes, remove bookmarks, and navigate directly back to the file in the Explorer.

## Usage

1. Open a file in the Source Explorer.
2. Click the Bookmark icon in the top right header.
3. Type a note and click Save (or press Enter).
4. View all bookmarks in the "Bookmarks & Notes" tab in the sidebar.
