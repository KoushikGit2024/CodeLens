# ADR 011: End-to-End Product Integration & Guided Workflow

## Context
CodeLens has evolved from a series of independent subsystems (AST parsing, dependency graphs, AI integration, refactoring intelligence, etc.) into a comprehensive code intelligence product. To provide a professional developer experience, we need to unify these features under a consistent, canonical application navigation structure.

## Decision
We have decided to:
1. **Remove intrusive tutorials:** Delete the modal `WelcomeTour` as it disrupts the developer workflow.
2. **Implement progressive disclosure:** Add a "Guided Workflow" directly into the `RepositoryIntelligencePage` that provides contextual action cards ("Explore Architecture", "Review Health", "Inspect Dependencies") post-analysis.
3. **Enforce canonical deep linking:** Ensure that all components that reference files or risks link to canonical routes (`/explore/:repoId/source?path=...`) to prevent state fragmentation.
4. **Standardize AI fallback UI:** Solidify the `AiResponse` and `AiMarkdown` components to natively handle and display "AI Unavailable" states. The platform will gracefully degrade to deterministic-only mode without crashing or presenting generic "Something went wrong" errors.
5. **Preserve Editor Context:** The `ExplorerPage` editor actively monitors the user's cursor selection and passes it to the AI assistant backend, enabling highly localized query resolution.

## Consequences
- **Positive:** A vastly improved and predictable user experience. Navigation flows intuitively between high-level architectural insights and low-level source code views.
- **Positive:** Complete resilience against AI provider outages or misconfigurations. The product remains fully functional offline using its deterministic tree-sitter models.
- **Negative:** Increased reliance on URL query parameters (`?path=`, `?line=`) which must be consistently parsed across all root feature components.
