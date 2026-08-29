# CodeLens — Developer Documentation

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Install

```bash
# Install all workspaces
npm install
cd server && npm install
cd ../client && npm install
```

### Configure

```bash
cp server/.env.example server/.env
# Add your IBM API credentials when ready (Step 5+)
```

### Run (development)

```bash
# Terminal 1 — backend on :3001
cd server && npm run dev

# Terminal 2 — frontend on :5173
cd client && npm run dev
```

### Run Tests

```bash
cd server
node ../node_modules/jest/bin/jest.js --runInBand --forceExit
```

> **Note**: Due to the project path containing spaces and an `&` character on Windows,
> Jest must be invoked via `node <path-to-jest>` rather than `npm test`.
> See [ADR-001](docs/adr/ADR-001-tree-sitter.md) for details.

---

## Architecture Overview

```
Upload
  └─▶ ZIP Extraction (safeExtract)
        └─▶ Repository Scanner (scanSourceFiles)
              └─▶ Language Detection (detectLanguage)
                    └─▶ Parser Registry (getParser)
                          └─▶ JavaScript/TypeScript Parser
                                └─▶ Symbol Extraction (incl. CJS require())
                                      └─▶ FileAnalysis[]
                                             └─▶ RepositoryAnalysis
                                                   ├─▶ REST API (analysis endpoints)
                                                   └─▶ Module Resolver
                                                         └─▶ Dependency Graph
                                                               └─▶ REST API (graph endpoints)
```

See [`docs/architecture/analysis-layer.md`](docs/architecture/analysis-layer.md) for the full Mermaid diagram.

---

## Project Structure

```
codelens/
├── AGENTS.md                  ← Bob persistent project context
├── server/                    Node.js + Express backend
│   ├── src/
│   │   ├── app.js             Express app configuration
│   │   ├── index.js           Server entry point (:3001)
│   │   ├── analyzers/         ← AST analysis + dependency graph
│   │   │   ├── languageDetector.js
│   │   │   ├── parserRegistry.js
│   │   │   ├── symbols.js           ← canonical data model
│   │   │   ├── BaseParser.js
│   │   │   ├── JavaScriptParser.js  ← JS/JSX + CJS require()
│   │   │   ├── TypeScriptParser.js
│   │   │   ├── repositoryAnalyzer.js
│   │   │   ├── moduleResolver.js    ← import → file path (Step 3)
│   │   │   └── dependencyGraph.js   ← graph builder (Step 3)
│   │   ├── controllers/
│   │   │   └── repositoryController.js
│   │   ├── middleware/upload.js
│   │   ├── repositories/repositoryStore.js
│   │   ├── routes/health.js
│   │   └── routes/repository.js
│   └── tests/analyzers/
│       ├── languageDetector.test.js
│       ├── parserRegistry.test.js
│       ├── JavaScriptParser.test.js
│       ├── TypeScriptParser.test.js
│       ├── repositoryAnalyzer.test.js
│       ├── moduleResolver.test.js    ← Step 3
│       ├── dependencyGraph.test.js   ← Step 3
│       └── commonJsRequire.test.js   ← Step 3
├── client/                    React + Vite + Tailwind frontend
│   └── src/
│       ├── App.jsx
│       ├── api/index.js
│       └── pages/
│           ├── UploadPage.jsx
│           ├── ExplorerPage.jsx
│           └── DependencyGraphPage.jsx  ← Step 3
└── docs/
    ├── data-model.md
    ├── dependency-graph.md     ← Step 3
    ├── architecture/analysis-layer.md
    └── adr/ADR-001-tree-sitter.md
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/repository/upload` | Upload ZIP — returns `{id, name, status:'analyzing'}` |
| GET | `/api/repository/:id` | Repository record + status |
| GET | `/api/repository/:id/files` | File tree (status must be `ready`) |
| GET | `/api/repository/:id/file?path=…` | Raw file content |
| GET | `/api/repository/:id/analysis` | Full analysis (symbols for all files) |
| GET | `/api/repository/:id/analysis/file?path=…` | Analysis for one file |
| GET | `/api/repository/:id/graph` | Full node/edge dependency graph |
| GET | `/api/repository/:id/architecture` | Architectural models and component grouping |
| GET | `/api/repository/:id/documentation/overview` | High-level repository documentation |
| GET | `/api/repository/:id/documentation/file` | File-level architectural documentation |
| POST | `/api/repository/:id/ask` | Ask questions about the repository |

**Upload flow:**
1. POST upload → response is `status: 'analyzing'`
2. Poll GET `/:id` until `status` is `'ready'`
3. GET `/:id/analysis` or `/:id/analysis/file?path=…`

---

## Adding a New Language

1. Confirm the grammar WASM exists in `tree-sitter-wasms/out/`:
   ```
   tree-sitter-python.wasm  ← already included in the package
   ```

2. Add the WASM entry to `parserRegistry.js`:
   ```js
   python: path.join(WASMS_OUT, 'tree-sitter-python.wasm'),
   ```

3. Add file extensions to `languageDetector.js`:
   ```js
   ['.py', 'python'],
   ```

4. Create `src/analyzers/PythonParser.js` extending `BaseParser`.

5. Register the factory in `repositoryAnalyzer.js`:
   ```js
   python: (tsParser) => new PythonParser(tsParser),
   ```

6. Add tests in `tests/analyzers/PythonParser.test.js`.

---

## Debugging Parser Failures

1. Check `FileAnalysis.hasErrors` — `true` means the file contained syntax errors
   but analysis still ran (tree-sitter is error-tolerant).

2. Check `FileAnalysis.error` — non-null means analysis was aborted for this file
   (e.g. file couldn't be read). Other files are unaffected.

3. To inspect the raw AST for a source file:
   ```js
   const { getParser } = require('./src/analyzers/parserRegistry');
   const parser = await getParser('javascript');
   const tree = parser.parse(source);
   // Walk tree.rootNode
   ```

4. The `parserRegistry` caches language objects after first load. If you need
   a clean slate, restart the server (there's no in-process cache invalidation).

---

## Version Control

- **Independent Repository**: CodeLens is independently version-controlled.
- **Git Root**: Its Git root is the CodeLens project directory (`AIDrivenCodeIntelligence_AutomatedDocumentationSystem`).
- **Security**: `.env`, API credentials, and generated artifacts (like `node_modules` or uploaded temp files) must **never** be committed.
- **Management**: The project should be cloned/managed independently from any parent directory it may reside in.

* **Step 1:** Foundation — ZIP upload, extraction, file tree, repository data store.
* **Step 2:** Structural Intelligence — **Tree-sitter AST Parsing**: Fully deterministic analysis of JavaScript, JSX, TypeScript, and TSX files.
* **Step 3:** Relational Intelligence — Module resolution, deterministic dependency graph, cycle detection.
* **Step 4:** Contextual Intelligence — Intelligent context assembly, IBM watsonx AI provider.
* **Step 5:** Interface — Code viewer (Monaco), repository Q&A panel, dependency graph visualization (React Flow).
* **Step 6:** Architectural Intelligence — Automatic component detection, architectural layer mapping, and Mermaid.js diagram generation with AI insights.
* **Step 7:** Documentation Intelligence — Automated hierarchical documentation, architectural deep-dives, and AI-driven repository overviews.
