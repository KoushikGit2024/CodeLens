# CodeLens — Project Context

## Identity

**AI-Driven Code Intelligence and Automated Documentation System**

CodeLens helps developers understand unfamiliar software repositories through:
- Deterministic source-code analysis (Tree-sitter AST parsing)
- Repository structure and dependency analysis
- AI-powered code explanations and question answering
- Architecture visualization and automated documentation

It must feel like a serious developer tool, not a generic chatbot.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| AST Parsing | web-tree-sitter (WASM) + tree-sitter-wasms |
| Frontend | React + Vite + Tailwind CSS + React Flow |
| Tests | Jest |
| Runtime | Node.js 18+ |

**Path constraint**: The project path contains `&`, which prevents `node-gyp` compilation.
`web-tree-sitter` (WASM) is used instead of native `tree-sitter` bindings. See `docs/adr/ADR-001-tree-sitter.md`.

---

## Project Structure

```
codelens/
├── AGENTS.md                        ← this file
├── README.md                        ← quick-start, API reference, structure guide
├── package.json                     ← npm workspace root
├── .agents/rules/ponytail.md        ← lazy-senior-dev engineering discipline
├── .bob/skills/                     ← Bob reusable skills
│   ├── codelens-dev/                ← Step-by-step implementation workflow
│   ├── code-analysis/               ← Tree-sitter parser work
│   ├── dependency-analysis/         ← Dependency graph work
│   └── documentation/               ← Documentation standards
├── server/
│   ├── src/
│   │   ├── app.js                   ← Express app config
│   │   ├── index.js                 ← Server entry point (:3001)
│   │   ├── analyzers/               ← ALL static analysis lives here
│   │   │   ├── languageDetector.js  ← extension → language ID
│   │   │   ├── parserRegistry.js    ← WASM init + grammar cache
│   │   │   ├── symbols.js           ← canonical symbol data model (factories)
│   │   │   ├── BaseParser.js        ← abstract parser base
│   │   │   ├── JavaScriptParser.js  ← JS/JSX symbols + CJS require()
│   │   │   ├── TypeScriptParser.js  ← TS/TSX (extends JavaScriptParser)
│   │   │   ├── repositoryAnalyzer.js← orchestrates full-repo scan
│   │   │   ├── moduleResolver.js    ← import specifier → file path
│   │   │   └── dependencyGraph.js   ← builds node/edge graph from analysis
│   │   ├── ai/                      ← AI context + Q&A layer (Step 4)
│   │   │   ├── aiProvider.js        ← provider abstraction + IBM watsonx
│   │   │   ├── contextBuilder.js    ← relevance scoring + context assembly
│   │   │   └── askController.js     ← POST /ask handler
│   │   ├── controllers/repositoryController.js
│   │   ├── middleware/upload.js
│   │   ├── repositories/repositoryStore.js
│   │   ├── routes/health.js
│   │   └── routes/repository.js
│   └── tests/
│       ├── analyzers/               ← Jest tests (run: cd server && npm test)
│       │   ├── languageDetector.test.js
│       │   ├── parserRegistry.test.js
│       │   ├── JavaScriptParser.test.js
│       │   ├── TypeScriptParser.test.js
│       │   ├── repositoryAnalyzer.test.js
│       │   ├── moduleResolver.test.js
│       │   ├── dependencyGraph.test.js
│       │   └── commonJsRequire.test.js
│       └── ai/
│           ├── contextBuilder.test.js
│           └── askEndpoint.test.js
├── client/src/
│   ├── App.jsx                      ← Routes: /, /explore/:id, /explore/:id/graph
│   ├── api/index.js                 ← Axios API client (all endpoints)
│   └── pages/
│       ├── UploadPage.jsx
│       ├── ExplorerPage.jsx         ← file tree + "Dependency Graph" link
│       └── DependencyGraphPage.jsx  ← React Flow graph view
└── docs/
    ├── README.md → (see root README.md)
    ├── data-model.md                ← symbol types + graph node/edge schemas
    ├── dependency-graph.md          ← full Step 3 reference (graph, resolution, API)
    ├── ai-context.md                ← Step 4: AI architecture, context schema, API
    ├── architecture/analysis-layer.md ← Mermaid data flow, module responsibilities
    └── adr/ADR-001-tree-sitter.md   ← why web-tree-sitter was chosen
```

---

## Completed Steps

| Step | Feature | Status |
|------|---------|--------|
| 1 | ZIP upload, extraction, repository store, REST API skeleton | ✅ |
| 2 | Tree-sitter AST analysis — JS/TS symbols, imports, exports, CJS | ✅ |
| 3 | Dependency graph — module resolver, graph builder, graph API, React Flow UI | ✅ |
| 4 | AI context builder, IBM watsonx provider, repository Q&A, ExplorerPage panel | ✅ |
| 5 | Code viewer, AI file references, deep-linking | ✅ |
| 6 | Architecture Intelligence — Component detection, Mermaid generation, AI insights | ✅ |
| 7 | Automated Documentation Intelligence — Deterministic context + AI interpretation | ✅ |
| 8 | AI Repository Intelligence & Contextual Code Q&A — Deterministic routing + Structured AI | ✅ |
| 9 | Incremental Repository Analysis & CI/CD Intelligence — File Fingerprinting + Change Impact | ✅ |
| 10 | Multi-Language Intelligence — Python, Java, C++ parsing + AI context integration | ✅ |

---

## API Endpoints (current)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/repository/upload` | Upload ZIP |
| GET | `/api/repository/:id` | Repository record + status |
| GET | `/api/repository/:id/files` | File tree |
| GET | `/api/repository/:id/file?path=…` | Raw file content |
| GET | `/api/repository/:id/analysis` | Full symbol analysis |
| GET | `/api/repository/:id/analysis/file?path=…` | Single-file analysis |
| GET | `/api/repository/:id/graph` | Full dependency graph |
| GET | `/api/repository/:id/graph/file?path=…` | File dependencies/dependents |
| GET | `/api/repository/:id/architecture` | Architectural model + insights |
| GET | `/api/repository/:id/documentation/overview` | Generated repository docs |
| GET | `/api/repository/:id/documentation/file?path=…` | Generated module docs |
| POST | `/api/repository/:id/analyze` | Run full or incremental analysis |
| GET | `/api/repository/:id/impact` | Get change impact for modified files |
| GET | `/api/repository/:id/ci-report` | Get headless CI/CD intelligence report |
| POST | `/api/repository/:id/ask` | (Legacy) AI Q&A |
| POST | `/api/repository/:id/question` | AI Repository Intelligence Q&A — `{ question }` → structured answer |

---

## Running the Project

```bash
# Backend (port 3001)
cd server && npm run dev

# Frontend (port 5173)
cd client && npm run dev

# Tests (must use node invocation — path contains &)
cd server
node ../node_modules/jest/bin/jest.js --runInBand --forceExit
# or:  npm test
```

Current test count: **269 tests, 10 suites, all passing.**

---

## Three-Layer Architecture (enforced)

```
Deterministic Analysis   →  What actually exists in the repo?
Context Construction     →  Which information is relevant to this task?
AI Reasoning             →  What does this information mean?
```

**The AI layer must never replace deterministic analysis.**

---

## Key Conventions

- All symbol factories live in `symbols.js` — do not define symbol shapes elsewhere.
- Import symbols from both ESM and CJS use `kind: 'import'` and `source: <specifier>`.
- CJS specifier types: `'cjs-default'` / `'cjs-named'`. ESM types: `'default'` / `'named'` / `'namespace'` / `'side-effect'`.
- Graph node IDs: `file:<relativePath>` and `pkg:<packageName>`.
- All paths in the API and analysis are **forward-slash, relative to repo root**.
- `FileAnalysis.error` non-null = analysis aborted. `hasErrors: true` = partial AST, still analysed.
- Unresolved imports are counted in `meta.unresolvedImports` — never fabricated as edges.

---

## Development Rules

Full rules in `.bob/skills/codelens-dev/SKILL.md`.

Short version:
1. **Inspect before implementing** — read files, tests, docs before touching anything.
2. **Workspace is source of truth** — never trust chat context over actual code.
3. **Minimal change** — implement exactly what was asked, nothing more.
4. **Test everything significant** — run `npm test` before and after changes.
5. **Document what you build** — update `docs/` as part of every feature.
6. **Don't start the next step** — stop and report after each step completes.
