# Refactoring Decomposition Analyzer (LCOM4 Cohesion Clustering)

CodeLens provides client-side automated refactoring decomposition planning using **Lack of Cohesion of Methods (LCOM4)** and connected-component clustering. This capability enables deterministic, structural decomposition recommendations for monolithic and low-cohesion modules directly inside the user's browser.

## How it works

1. **Symbol Graph Construction ($G = (V, E)$)**:
   - Each top-level function, class, or method is treated as a vertex $V$.
   - Undirected edges $E$ are created between symbols based on:
     - **Direct Call Invocations**: Symbol $A$ directly invokes symbol $B$ within its body.
     - **Shared Entity Identifiers / Parameters**: Symbols manipulating identical non-generic domain tokens (e.g., `userId`, `accountConfig`).
     - **Semantic Domain Clustering**: Matching multi-token domain entities extracted via camelCase and snake_case tokenization.

2. **LCOM4 Calculation**:
   - The graph $G$ is partitioned into its connected components using Breadth-First Search (BFS).
   - The number of connected components represents the LCOM4 score:
     - $\text{LCOM4} = 1$: Cohesive module (functions collaborate on common tasks).
     - $\text{LCOM4} \ge 2$: Low cohesion (module contains independent clusters suitable for extraction into separate files).

3. **Archetype Role Classification**:
   Each isolated cluster is classified into an architectural archetype based on signature token analysis:
   - `FORMATTERS`: String, currency, date, or display conversion utilities.
   - `VALIDATORS`: Schema validation, sanitization, assertions, and invariant checks.
   - `DATA_ACCESS`: Fetching, querying, storage, or external API communication.
   - `PRESENTATION`: UI rendering, layout, or component markup.
   - `STATE_HANDLERS`: Actions, mutations, reducer handlers, or event managers.
   - `CORE_DOMAIN`: Core business logic calculations and orchestrations.

4. **Automated Split Blueprints**:
   - Proposes concrete target filenames (e.g., `orderService.validators.js`, `orderService.formatters.js`, `orderService.service.js`).
   - Computes expected lines of code (LOC) per split module.
   - Provides migration instructions with symbol exports and imports.

5. **Dynamic Strategy Synthesis**:
   - Generates issue-tailored refactoring action plans dynamically derived from the file's archetype (React Component, Service, Controller, Utility, Model), cyclomatic metrics, nesting depths, and cycle paths.
   - Replaces generic boilerplate with contextual guidance naming specific symbols and thresholds.

## UI Integration

- **Refactoring Intelligence Page (`RefactoringPage.jsx`)**:
  - Modules with $\text{LCOM4} \ge 2$ display a dedicated **Decomposition Blueprint** section.
  - Interactive split file cards with copy buttons, symbol pills, LOC estimates, and step-by-step migration checklists.
  - Portaled `MetricInfoButton` popovers detailing LCOM4 theory and interpretation.

## Privacy & Statelessness

All symbol graph construction, BFS component traversal, and blueprint synthesis run 100% inside client-side Web Workers. Zero source code or repository structures are sent to backend servers.
