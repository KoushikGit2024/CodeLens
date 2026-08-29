# ADR 008: Engineering Risk & Maintainability Intelligence

## Status
Accepted

## Context
As CodeLens expands its deterministic static analysis capabilities, users need actionable insights regarding the structural health, maintainability, and engineering risk of their repositories. Existing generic tools (like SonarQube) often rely on broad heuristics, but CodeLens already possesses a precise, deterministically generated `DependencyGraph` and `ArchitectureModel`. We need to surface these risks to the user and integrate them into the AI capabilities without rebuilding existing logic or implementing a second dependency scanner.

## Decision
We will implement an **Engineering Risk Model** that derives deterministic risks from the existing `RepositoryAnalysis`, `DependencyGraph`, and `ArchitectureModel`. This model will act as the source of truth for engineering health and will feed both the frontend UI and the IBM watsonx AI context.

The rules for this model are:
1. **Deterministic First**: AI must only interpret risks that are explicitly found in the deterministic risk model.
2. **Reusability**: Use existing data (e.g., `lineCount` from `FileAnalysis`, `cycles` and `unresolvedDependencies` from `DependencyGraph`).
3. **Focused Heuristics**: Restrict to SIZE, COUPLING, DEPENDENCY, and ARCHITECTURE risks to avoid false positives (e.g., avoiding dead code detection until local symbol usage is fully implemented).

## Consequences
- **Positive**: Zero additional static analysis parsers required. Fast execution. Actionable, high-fidelity insights that are directly grounded in the repository's structural truth.
- **Negative**: The model is limited by the current AST and Graph capabilities (e.g., cannot track variable-level coupling or local unused variables without further Tree-sitter enhancements).

## Alternatives Considered

Not documented for this ADR.

## Related Documentation

Not documented for this ADR.
