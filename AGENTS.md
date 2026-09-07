# CodeLens — Contributor & Agent Guide

This document defines the rules, philosophies, and operational guidelines for developing the CodeLens system. **All AI Agents and human contributors must follow these instructions.**

## 1. The Core Philosophy: Deterministic First, AI Second

CodeLens is NOT a generic chat wrapper around a repository.

**Rule:** AI must NEVER replace deterministic analysis when facts can be obtained from the repository itself.

- **Bad**: Passing raw source code to Watsonx and asking "What are the dependencies of this file?"
- **Good**: Running Tree-sitter in the browser to parse the AST, building the dependency graph locally, and then sending the computed graph facts to Watsonx to ask "Can you explain why this dependency structure is highly coupled?"

### The Architecture: Client-Dominant Analysis, Server-Only AI

CodeLens operates on a strict **client-dominant** architecture. The guiding rule is simple:

> **If it is static analysis, it runs on the client. If it requires AI, it goes to the server.**

#### Server (`server/src/`) — AI Proxy Only
The server is intentionally minimal and strictly stateless. It stores absolutely zero information — no files, no analysis, no user data. Its ONLY mechanical role is:
1. **AI Proxy**: Receive a fully pre-built context prompt (assembled entirely by the client) and forward it verbatim to the IBM watsonx API. Return the AI response to the client. The server does not build this prompt — it only relays it.

The server does NOT parse code, does NOT build dependency graphs, does NOT compute complexity scores, does NOT detect clones, and does NOT produce architecture or risk models. It has no concept of code structure at all.

#### Client (`client/src/`) — Full Analysis Engine
The client browser is the sole analysis engine and data store. It is responsible for:
1. **File Handling**: Processing ZIP uploads and reading source file content entirely in the browser.
2. **Parsing** source files using `web-tree-sitter` (WASM) running inside a dedicated Web Worker (`analyzer.worker.js`) to avoid blocking the UI thread.
3. **Extracting** symbols (functions, classes, imports, exports).
4. **Building** the dependency graph, architecture model, and all other structural models entirely in-memory.
5. **Computing** all quality metrics: cyclomatic complexity, dead code reachability, cross-file clone detection, coupling scores.
6. **Persisting** analysis results to **IndexedDB** in the browser so repeat visits are fast (no re-parsing).
7. **Building** the AI context payload from the locally computed data models.
8. **Sending** only the pre-built context prompt to the server's AI proxy endpoint.

## 2. Testing Requirements

- CodeLens maintains 100% passing tests.
- You MUST run `npm test` from the `server` directory before and after making changes to server code.
- Note: If `npm test` fails due to path constraints (e.g., an `&` in the path name), use `node ../node_modules/jest/bin/jest.js --runInBand --forceExit`.
- Every new AI-related server handler MUST have corresponding Jest tests.
- Client-side analysis services in `client/src/services/analyzer/` MUST have unit tests.

## 3. Documentation Requirements

- Documentation is a first-class citizen.
- If you add a new server endpoint, you MUST update `docs/api.md`.
- If you add a new client-side analyzer, you MUST document it in `docs/frontend/`.
- After modifying any documentation, you MUST run `npm run docs:check` from the root directory to ensure no relative markdown links are broken.

## 4. Git and Security Rules

- CodeLens operates in its own project-local Git repository. Do NOT modify the parent repository.
- Do NOT alter `.gitignore` to track `node_modules`, `.env`, `.bob/`, `.agents/`, `dist/`, or temporary `.data/` folders.
- Do NOT commit API keys or environment secrets.
- Always use relative forward-slash paths internally.

## 5. State Management & Storage Philosophy

**Rule:** The backend must remain strictly stateless. It stores zero information — not even temporary files.
- All files from the ZIP upload are processed entirely in the browser.
- All analysis results (symbols, graphs, complexity scores, clone groups) are computed on the client and persisted in **browser IndexedDB**. They are never sent back to the server.
- User-specific data (AI chat histories, UI preferences) MUST also be stored locally on the client (e.g., `localStorage`).
- Client-side analysis results are treated as **reproducible caches**: deleting IndexedDB data simply triggers a re-analysis on next load.

## 6. Development Commands

From the root directory:

- **Run Dev**: `npm run dev` (Starts both client and server via concurrently)
- **Install**: `npm run install:all`
- **Check Docs**: `npm run docs:check`
- **Test Server**: `npm test`

From the `client` directory:
- **Build Frontend**: `npm run build`

## 7. Extension Guidelines

When adding a new intelligence capability:
1. **Client analysis**: Build the deterministic analysis logic in `client/src/services/analyzer/` as a service that runs inside the Web Worker.
2. **UI visualization**: Build the rendering components in `client/src/features/`.
3. **AI context**: If the user wants an AI explanation, extend the client-side context builder to include the newly computed facts in the prompt payload.
4. **Server endpoint (only if AI needed)**: Add a minimal pass-through endpoint in the server only if a new AI capability requires a new route.
5. **Update `docs/`**.

## 8. Current Project State
We have completed up to **Step 20** (Deterministic Analysis Expansion — Dead Code, Cyclomatic Complexity, Cross-File Clone Detection, AI Context Integration, and UI visualization on the Engineering Health page). The canonical architecture is **client-dominant**: the browser handles file extraction, runs Tree-sitter WASM, builds all analysis models, persists to IndexedDB, and uses the server ONLY as a medium for AI interaction.
