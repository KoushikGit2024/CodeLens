# API Reference

CodeLens exposes a REST API from the Express backend to the React frontend. 

All endpoints return JSON unless otherwise specified.

## Core API

### `GET /api/health`
- **Purpose**: Server health check.
- **Parameters**: None.
- **Returns**: `{ status: 'ok', version: '1.0.0' }`

---

## Repository Lifecycle API

### `POST /api/repository/upload`
- **Purpose**: Uploads and extracts a ZIP repository into the secure sandbox.
- **Body**: `multipart/form-data` with field `file` containing the ZIP.
- **Returns**: `{ repoId: "uuid", name: "repo-name", status: "extracted" }`
- **Analysis Triggered**: No.

### `GET /api/repository/:id`
- **Purpose**: Fetch repository metadata and extraction status.
- **Returns**: `{ id, originalName, status, extractedAt }`

### `GET /api/repository/:id/files`
- **Purpose**: Get the deterministic file tree.
- **Returns**: `{ name: "repo", type: "directory", children: [...] }`

### `GET /api/repository/:id/file?path=...`
- **Purpose**: Get raw source code for the Monaco editor.
- **Parameters**: `path` (query parameter, e.g., `src/index.js`).
- **Returns**: `{ content: "..." }`

---

## Intelligence & Analysis API

### `POST /api/repository/:id/analyze`
- **Purpose**: Triggers a full or incremental AST analysis of the repository.
- **Body**: Optional `{ force: true }`
- **Returns**: `{ status: "success", analyzedFiles: N, cachedFiles: N }`
- **Analysis Triggered**: Yes (Tree-sitter).

### `GET /api/repository/:id/intelligence`
- **Purpose**: Fetches the Unified Repository Intelligence dashboard data.
- **Returns**: Aggregated metrics on architecture, risks, hotspots, files, and dependencies.

### `GET /api/repository/:id/analysis`
- **Purpose**: Fetch the complete `RepositoryAnalysis` object (all symbols).
- **Returns**: `{ meta: {}, files: [...] }`

### `GET /api/repository/:id/analysis/file?path=...`
- **Purpose**: Fetch analysis for a single file.
- **Returns**: `{ path, language, symbols: [...], errors: [...] }`

---

## Graph & Architecture API

### `GET /api/repository/:id/graph`
- **Purpose**: Fetch the full dependency graph.
- **Returns**: `{ nodes: [...], edges: [...] }`

### `GET /api/repository/:id/graph/file?path=...`
- **Purpose**: Fetch only the immediate dependencies and dependents for a specific file.
- **Returns**: `{ dependencies: [...], dependents: [...] }`

### `GET /api/repository/:id/architecture`
- **Purpose**: Fetch component groups, layer assignments, and a Mermaid diagram.
- **Returns**: `{ components: [...], layers: [...], mermaid: "..." }`

---

## Health & Risk API

### `GET /api/repository/:id/risks`
- **Purpose**: Fetch deterministic engineering risks (Size, Coupling, Cycles).
- **Returns**: `{ score: 85, summary: "...", risks: [...] }`

### `GET /api/repository/:id/refactoring`
- **Purpose**: Fetch prioritized refactoring candidates based on risks.
- **Returns**: `{ candidates: [{ id, targetFile, strategy, priority, description }] }`

### `GET /api/repository/:id/refactoring/:cId`
- **Purpose**: Fetch details for a specific refactoring candidate.
- **Returns**: `{ candidate, impact }`

---

## CI/CD Impact API

### `GET /api/repository/:id/impact?files=file1,file2`
- **Purpose**: Determine the blast radius of modifying specific files.
- **Returns**: `{ directDependents: [...], transitiveDependents: [...], impactScore: N }`

### `GET /api/repository/:id/ci-report?files=file1,file2`
- **Purpose**: A headless endpoint to generate a markdown string report of risks and impact for a CI/CD pipeline (e.g. GitHub Actions).
- **Returns**: `{ report: "markdown string" }`

---

## AI API (IBM watsonx)

### `POST /api/repository/:id/question`
- **Purpose**: Submits a user question to the AI Repository Assistant.
- **Body**: `{ question: "What does AuthController do?" }`
- **Returns**: `{ answer: "...", references: [...] }`
- **AI Involved**: Yes.

### `POST /api/repository/:id/ask`
- **Purpose**: Legacy AI Q&A endpoint. (Use `/question` instead).
- **Body**: `{ question: "..." }`
- **Returns**: `{ answer: "..." }`
- **AI Involved**: Yes.

### `GET /api/repository/:id/risks/insights`
- **Purpose**: Get AI-generated insights on the overall engineering health.
- **Returns**: `{ insights: "..." }`
- **AI Involved**: Yes.

### `GET /api/repository/:id/refactoring/:cId/insights`
- **Purpose**: Get an AI-generated step-by-step strategy for a refactoring candidate.
- **Returns**: `{ strategy: "..." }`
- **AI Involved**: Yes.

### `GET /api/repository/:id/documentation/overview`
- **Purpose**: Get AI-generated documentation for the entire repository.
- **Returns**: `{ content: "..." }`
- **AI Involved**: Yes.

### `GET /api/repository/:id/documentation/file?path=...`
- **Purpose**: Get AI-generated documentation for a single module.
- **Returns**: `{ content: "..." }`
- **AI Involved**: Yes.
