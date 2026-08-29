# Change Impact Analysis

CodeLens can predict the blast radius of a code modification using the Dependency Graph.

## Implementation

`server/src/analyzers/changeImpact.js` accepts a list of modified files and traverses the `DependencyGraph` in reverse (tracing dependents).

1. **Direct Dependents**: Files that directly import a modified file.
2. **Transitive Dependents**: Files that import the direct dependents, calculated recursively up to a certain depth.
3. **Impact Score**: A heuristic score calculated based on the number of dependents and the type of architectural components affected.

## Use Cases

- **CI/CD Intelligence**: Automated pipelines can use the `GET /api/repository/:id/impact` or `GET /api/repository/:id/ci-report` endpoints to warn reviewers if a pull request modifies core files that impact hundreds of other components.
- **Refactoring Validation**: Helps developers understand what files need to be re-tested when applying a refactoring strategy.
