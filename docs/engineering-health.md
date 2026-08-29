# Engineering Risk & Maintainability Intelligence

CodeLens evaluates the structural health of your repository deterministically, surfacing engineering risks before you have to ask AI.

## Risk Categories

The system detects the following risks out-of-the-box:

### Size Risks
- **Huge Files**: Files exceeding 500 lines are flagged as high risk (too many responsibilities).
- **Broad API Surfaces**: Files exporting more than 15 symbols are flagged for potential abstraction leaks.

### Coupling Risks
- **Dependency Bottlenecks (High Fan-Out)**: Modules importing more than 15 internal/external dependencies.
- **Central Modules (High Fan-In)**: Modules imported by more than 10 other internal modules.

### Dependency Risks
- **Circular Dependencies**: Deterministically detected via DFS on the internal file dependency graph. Flagged as CRITICAL.
- **Unresolved Imports**: Points to missing `package.json` dependencies or broken path aliases.
- **Isolated Modules**: Files that neither import nor are imported by anything else.

### Architecture Risks
- **Cross-Layer Violations**: Presentation layer components depending directly on Data layer components.

## AI Integration

The risk model is passed to the AI (IBM watsonx) to generate:
- Priority action items and recommendations
- Architectural observations
- Explanations of complex couplings

## API Endpoint
`GET /api/repository/:id/risks`
Returns the deterministic `EngineeringRiskModel` including score, hotspots, and individual risk items.
