# Engineering Risk Analyzer

The Engineering Risk Analyzer (`server/src/analyzers/engineeringRiskAnalyzer.js`) calculates a quantitative "Health Score" for a repository by detecting structural code smells.

## Risks Monitored

1. **SIZE Risks**: Files that exceed defined threshold limits for total lines of code or total number of symbols (functions/classes). Monoliths are harder to maintain and test.
2. **COUPLING Risks**: Files with excessively high "fan-out" (importing dozens of other modules) or "fan-in" (being imported by dozens of other modules). High fan-out indicates a "God Object" or coordinator that is doing too much.
3. **DEPENDENCY Risks**: Circular dependencies. Detected by a Depth-First Search cycle detection algorithm in `dependencyGraph.js`. Cycles cause initialization errors and tightly couple components.
4. **ARCHITECTURE Risks**: Broken architectural boundaries (e.g., UI components directly importing database drivers).

## Integration

The deterministic risk model is surfaced in the Engineering Health dashboard and is provided to IBM watsonx to generate AI insights on how these structural issues might affect long-term maintainability.
