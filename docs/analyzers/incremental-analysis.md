# Incremental Repository Analysis & CI/CD Intelligence

CodeLens Step 9 introduces **Incremental Repository Analysis**, enabling the system to efficiently handle updates to a repository without reprocessing the entire codebase.

## 1. File Fingerprinting & Cache Model
During analysis, CodeLens calculates a stable **SHA-256 hash** for the contents of each source file.
The deterministic file cache uses this fingerprint to decide if a file needs to be parsed:
```javascript
same path + same content hash + same parser configuration = cache hit (reuse FileAnalysis)
```
The analysis metadata tracks cache hits, cache misses, added files, deleted files, and modified files.

## 2. Dependency Graph & Architecture Invalidation
CodeLens maintains the guarantee that **Incremental Analysis output equals Clean Full Analysis output**. 
Since the Dependency Graph and Architecture Model are built *dynamically* from the `RepositoryAnalysis` object:
1. When a new incremental analysis completes, the updated `RepositoryAnalysis` is saved.
2. The old cached graph is effectively discarded.
3. The next time the graph or architecture is requested, it is rebuilt dynamically from the new deterministic file analysis.
This avoids serving stale dependencies or architecture boundaries.

## 3. Change Impact Analysis
CodeLens provides a deterministic change impact feature utilizing the dependency graph.
Given a list of changed files, it calculates:
- **Direct Dependents**: Files that directly import the changed files.
- **Transitive Dependents**: Files downstream in the dependency tree (calculated via Breadth-First Search).
- **Affected Components**: The architectural components that contain any of the affected files.

This intelligence powers the `/explore/:id/impact` UI, allowing developers to see the exact blast radius of a PR or local change.

## 4. CI/CD Intelligence
CodeLens exposes machine-readable endpoints for CI integration:
- `POST /api/repository/:id/analyze` -> Triggers full or incremental analysis.
- `GET /api/repository/:id/ci-report` -> Returns a JSON report containing unresolved imports, dependency cycles, changed files, and affected architectural components.

This allows CodeLens to be integrated into CI/CD pipelines to enforce architectural rules or generate automated PR impact reports.
