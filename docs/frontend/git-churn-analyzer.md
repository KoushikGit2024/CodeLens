# Git Churn Analyzer

CodeLens supports extracting and analyzing Git history from the local browser using `isomorphic-git` and `@isomorphic-git/lightning-fs`. This allows CodeLens to calculate "Churn"—how often a file changes—entirely on the client-side.

## How it works

1. **Virtual File System**: During ZIP upload, if the user includes the `.git` directory, CodeLens persists it to an IndexedDB store. 
2. **Commit Traversal**: The `git.analyzer.js` module extracts the `.git` folder from IndexedDB into a virtual `lightning-fs` volume. It then walks backwards through the last 500 commits using `isomorphic-git.log()`.
3. **Diff Calculation**: For each consecutive pair of commits in the window, it runs `isomorphic-git.walk()` to identify exactly which files were modified.
4. **Churn Score**: 
   `Churn Score = (number of times file changed / total diffs in window) * 100`
5. **Composite Risk**: The analyzer combines the structural complexity score from the tree-sitter analysis with the temporal churn score:
   `Composite Risk = (0.6 * Complexity Score) + (0.4 * Churn Score)`

## UI Integration

- **Engineering Health Page**: High churn files are highlighted with a 🔥 badge and surfaced in a dedicated Churn table, sorting files by their `Composite Risk`.
- **Dependency Graph Page**: A toggle in the graph settings allows users to overlay churn directly onto nodes. High-churn files will receive a thick orange/red bottom border proportional to their churn score.

## Privacy & Statelessness

This entire process happens inside the user's browser (Web Worker). No source code or commit history is ever sent to the CodeLens backend server.
