# Architecture Intelligence

CodeLens Step 6 introduces an Architecture Intelligence layer that sits on top of the deterministic `RepositoryAnalysis` (AST symbols) and `DependencyGraph`.

## Purpose
While the dependency graph shows precise module-to-module imports, it is often too granular for a high-level understanding of a system. The Architecture Intelligence layer groups these granular details into higher-level abstractions:
- **Components:** Logical groupings of files (e.g. by folder).
- **Layers:** Identification of architectural responsibilities (Presentation, API, Service, Data).
- **Entry Points:** Detection of system starting points (`index.js`, `server.js`).
- **API Boundaries:** Exposed routes and controllers.

## Architecture Model (`ArchitectureModel`)
The backend exposes this data via `GET /api/repository/:id/architecture`.

### Schema

```typescript
type ArchitectureModel = {
  components: Component[];
  relations: ComponentRelation[];
  entryPoints: string[];
  apiBoundaries: ApiBoundary[];
  isolatedFiles: string[];
  meta: {
    totalComponents: number;
    builtAt: string;
  };
}

type Component = {
  name: string;        // E.g., 'controllers', 'auth'
  layer: string;       // E.g., 'API', 'Service', 'Presentation', 'Data'
  files: string[];     // Array of file paths belonging to this component
}

type ComponentRelation = {
  source: string;      // Component name
  target: string;      // Component name or package name
  targetType: 'internal' | 'external';
  type: string;        // 'imports' | 'requires'
  evidenceFile: string;// An example file where the relation originates
}

type ApiBoundary = {
  filePath: string;
  exports: string[];   // Exposed functions/classes
}
```

## Detection Heuristics

The analysis is performed deterministically using `server/src/analyzers/architectureAnalyzer.js`.

### 1. Component Grouping
Files are grouped into components based on their top-level directory (e.g., `src/controllers/auth.js` -> `controllers`).

### 2. Layer Mapping
Files are mapped to architectural layers based on their paths and extensions:
- **Presentation:** `.jsx`, `.tsx`, `/components/`, `/pages/`, `/views/`
- **API:** `/controllers/`, `/routes/`, `/api/`
- **Service:** `/services/`, `/core/`
- **Data:** `/models/`, `/repositories/`, `/db/`

A component's overall layer is determined by aggregating its constituent files.

### 3. Entry Point Detection
Files matching standard entry point names (e.g., `index.js`, `server.js`, `app.js`) that also have very low in-degree (<= 2) in the dependency graph are classified as entry points.

## Visualization (Mermaid)
The Architecture Intelligence layer automatically translates the `ArchitectureModel` into a Mermaid flowchart (`flowchart TD`).

- Components are represented as nodes.
- External packages are represented as nodes with a box icon.
- Colors are applied based on the detected layer (e.g., Purple for API, Green for Service, Red for Data).
- Directed edges represent dependencies between components.

The generated Mermaid string is sent to the frontend and rendered using `mermaid.js` in `ArchitecturePage.jsx`.

## AI Insights
The structured `ArchitectureModel` is injected into a specialized prompt and sent to IBM watsonx (`architectureInsights.js`). The model is asked to provide:
1. **Architecture Summary**
2. **Major Responsibilities**
3. **Architectural Observations (Facts)**
4. **Architectural Insights (Inferences/Risks)**

*Failure Resilience:* If the AI provider is unavailable, the backend returns a status of `unavailable` for the insights, while the deterministic architecture model and Mermaid diagram are still successfully returned and rendered on the frontend.
