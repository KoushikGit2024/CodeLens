# ADR 010: Unified Repository Intelligence

## Status
Accepted

## Context
By Step 13, CodeLens possessed multiple powerful but siloed intelligence engines: AST Parsing, Dependency Analysis, Architecture Detection, Engineering Health, and Actionable Refactoring. A developer opening a repository had to navigate through each tab manually to build a mental model of the project.

## Decision
We decided to build a **Unified Repository Intelligence Layer** (Step 14) to serve as the default orientation dashboard.

1. **Aggregation, Not Re-computation**: The unified layer aggregates data from the existing deterministic models. It does not introduce a second parsing pipeline or duplicate dependency analysis.
2. **Deterministic Hotspots**: We introduced a deterministic algorithm to score files based on complexity, coupling, and risk, highlighting the most critical files to understand.
3. **Bounded AI**: We extended the Repository Assistant to handle a `REPOSITORY_OVERVIEW` intent. The AI is fed the deterministic intelligence summary—not the raw source code—to generate a high-level explanation. This maintains our "Deterministic First" philosophy.
4. **Cross-System Navigation**: The dashboard provides deep links into the specialized views (e.g., "View Health", "View Graph", "Source Explorer").

## Consequences
- **Positive**: Developers get an immediate, holistic understanding of the repository upon opening it.
- **Positive**: AI generation is extremely fast and accurate because the context is highly bounded and structured.
- **Positive**: The system remains robust and functional even if the AI provider goes offline.
- **Negative**: The unified model requires careful updating if any underlying analyzer changes its schema.

## Alternatives Considered

Not documented for this ADR.

## Related Documentation

Not documented for this ADR.
