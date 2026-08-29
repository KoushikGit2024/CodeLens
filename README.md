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

### Step 9: Incremental Repository Analysis & CI/CD Intelligence
- SHA-256 fingerprinting for FileAnalysis caching
- Direct and Transitive Dependency Impact Analysis
- `client/src/pages/ImpactPage.jsx` for blast-radius visualization
- `/api/repository/:id/ci-report` endpoint for pipeline integration

### Step 10: Multi-Language Code Intelligence
- Extensible Tree-sitter architecture supporting `python`, `java`, `cpp`.
- Language-aware import resolution (`moduleResolver.js`) mapping Python/Java/C++ conventions.
- Unified canonical symbol schema (`INTERFACE`, `STRUCT`, `NAMESPACE`).
- Syntax-highlighted file viewing and cross-language dependency graphs.

- [Data Model](docs/data-model.md)
- [Dependency Graph API](docs/dependency-graph.md)
- [AI Architecture & Context](docs/ai-context.md)
- [Architecture & Analysis Layer](docs/architecture/analysis-layer.md)
- [Automated Documentation Intelligence](docs/automated-documentation.md)
- [Incremental Analysis & CI/CD](docs/incremental-analysis.md)
- [ADR 001: Web Tree-sitter](docs/adr/ADR-001-tree-sitter.md)
- [ADR 002: Context Builder](docs/adr/ADR-002-context-builder.md)
- [ADR 003: Architecture Layer](docs/adr/ADR-003-architecture-layer.md)
- [ADR 004: Automated Documentation](docs/adr/ADR-004-automated-documentation.md)
- [ADR 005: Incremental Analysis](docs/adr/ADR-005-incremental-analysis.md)
- [ADR 006: Multi-Language Intelligence](docs/adr/ADR-006-multi-language-intelligence.md)
- [Multi-Language Intelligence](docs/multi-language-intelligence.md)

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

CodeLens exposes its analysis through a REST API (default port 3001).

| Endpoint | Method | Description |
|---|---|---|
| `/api/repository/upload` | POST | Upload a ZIP file containing the repository |
| `/api/repository/:id` | GET | Check analysis status |
| `/api/repository/:id/files` | GET | Retrieve the file tree |
| `/api/repository/:id/file?path=...` | GET | Retrieve raw file content securely |
| `/api/repository/:id/analysis` | GET | Retrieve the AST-based symbol analysis |
| `/api/repository/:id/graph` | GET | Retrieve the module dependency graph |
| `/api/repository/:id/architecture` | GET | Retrieve architectural components and insights |
| `/api/repository/:id/documentation/overview` | GET | Retrieve generated repository docs |
| `/api/repository/:id/documentation/file?path=...` | GET | Retrieve generated module docs |
| `/api/repository/:id/analyze` | POST | Run full or incremental analysis |
| `/api/repository/:id/impact` | GET | Get change impact for modified files |
| `/api/repository/:id/ci-report` | GET | Get headless CI/CD intelligence report |
| `/api/repository/:id/question` | POST | Ask a contextual question about the repository |

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
* **Step 8:** AI Repository Intelligence — Contextual code Q&A, intent routing, dynamic RAG.
* **Step 9:** Incremental Analysis & CI/CD — Intelligent caching and transitive change impact tracking for CI pipelines.
* **Step 10:** Multi-Language Intelligence — Extensible parser integration for Python, Java, and C++.
