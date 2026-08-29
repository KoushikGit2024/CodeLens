# ADR 009: Actionable Refactoring Intelligence

## Status
Accepted

## Context
CodeLens identifies engineering risks (cycles, large files, architectural violations) via deterministic static analysis. To make these insights actionable, developers need guidance on *how* to fix them and *what* the impact of fixing them will be.

## Decision
We decided to build an **Actionable Refactoring Intelligence** layer that strictly adheres to the "Deterministic First" philosophy.

1. **Deterministic Strategies**: We introduced `refactoringStrategies.js` which maps known structural risks to established refactoring patterns (e.g., "Extract Shared Abstraction").
2. **Priority Scoring**: We implemented a transparent formula (`severity * impact * confidence`) in `refactoringAnalyzer.js` to rank candidates.
3. **Change Impact Integration**: We reused the existing `changeImpact.js` module to predict the blast radius of a refactoring operation *before* the developer starts.
4. **Bounded AI**: We extended `refactoringGenerator.js` to use IBM watsonx to explain the refactoring strategies specifically in the context of the repository. The AI is restricted to referencing files involved in the candidate or its impact radius.

## Consequences
- **Positive**: Refactoring advice is highly actionable because it comes with an immediate blast radius (change impact) calculation.
- **Positive**: The system remains functional and valuable even if the AI provider goes down (deterministic strategies are always available).
- **Negative**: The AI cannot automatically rewrite the code (by design, to avoid destructive errors, but some users might expect auto-fixes).

## Alternatives Considered

Not documented for this ADR.

## Related Documentation

Not documented for this ADR.
