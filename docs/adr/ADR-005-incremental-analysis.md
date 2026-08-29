# ADR 005: Incremental Analysis & Change Impact

## Status
Accepted

## Context
As CodeLens supports larger repositories and integrates with CI/CD, running a full AST parsing suite and graph generation on every minor file change becomes computationally expensive and slow. We need a way to only analyze the files that have changed, while maintaining the guarantee that incremental analysis produces the exact same output as a clean analysis. Additionally, users and CI pipelines need to know the blast radius of these changes (Change Impact Analysis).

## Decision
1. **File Fingerprinting**: We will use Node's native `crypto` module to generate a SHA-256 hash for the contents of each file.
2. **Local Caching**: The file fingerprint (`hash`) is stored within the `FileAnalysis` object. When re-analyzing a repository, the `RepositoryAnalyzer` will accept a previous `RepositoryAnalysis` object. If a file exists in the cache and its current content hash matches the cached hash, the `FileAnalysis` is reused entirely.
3. **Dynamic Graph Invalidation**: The Dependency Graph and Architecture Models will *not* be incrementally updated. Since graph edges depend on cross-file boundaries (e.g., File A imports File B), incrementally patching the graph is complex and error-prone. Instead, we rely on the deterministic file analysis cache. The graph is always built dynamically from the latest `RepositoryAnalysis` object.
4. **Change Impact**: We will implement a BFS algorithm on the Dependency Graph to compute both direct dependents (files that import the changed files) and transitive dependents (files that import the direct dependents, etc.). We will also correlate these files to the detected architecture components.

## Consequences
**Positive**:
- Significant performance improvements for repeated analyses (e.g., in a local development environment or CI server caching CodeLens state).
- Transitive change impact analysis provides immense value for PR review and CI/CD reporting.
- Deterministic output guarantee is preserved; CodeLens does not succumb to "stale graph" state bugs.

**Negative**:
- The initial analysis of a repository still pays the full parsing cost.
- Building the dependency graph still occurs dynamically, so graph generation time is not eliminated (though AST parsing time, which is much slower, is).

## Alternatives Considered

Not documented for this ADR.

## Related Documentation

Not documented for this ADR.
