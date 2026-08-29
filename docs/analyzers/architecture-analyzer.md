# Architecture Analyzer

CodeLens automatically infers high-level system architecture from raw dependency graphs.

## The Algorithm

`server/src/analyzers/architectureAnalyzer.js` uses the Dependency Graph to build a higher-order model of the repository.

1. **Component Detection**: It groups files into "components" based on directory proximity and import density. For example, `src/components/Button.jsx` and `src/components/List.jsx` are grouped into the `components` component.
2. **Layer Inference**: Components are heuristically assigned to architectural layers (e.g., `api`, `ui`, `core`, `utils`) based on their naming conventions and dependency direction.
3. **Entry Point Identification**: The analyzer searches for files with high fan-out but zero fan-in (files that import many things but are never imported themselves), or files with specific names like `index.js`, `main.py`, or `app.js`.
4. **Mermaid Generation**: The analyzer translates the component relationships into a Mermaid.js diagram (`mermaidGenerator.js`).

## Usage

This analyzer provides the deterministic foundation for the "Architecture" tab in the frontend, and serves as critical context for the AI when generating architectural insights and automated documentation.
