# System Architecture Overview

CodeLens is a modern web application that follows a **"Client-Dominant Analysis, Server-Only AI"** philosophy. The browser is the primary intelligence engine and data store. The server is strictly an AI proxy and stores zero information.

## High-Level Architecture

```mermaid
graph TD
    subgraph Browser["Browser (Client)"]
        UI[React/Vite UI]
        Worker[analyzer.worker.js (Web Worker)]
        IDB[(IndexedDB Cache)]
        CTX[AI Context Builder]

        UI -->|Trigger analysis| Worker
        Worker -->|Tree-sitter WASM parse| Worker
        Worker -->|"Symbols, Graph, Complexity, Clones, Dead Code"| IDB
        IDB -->|Load cached results| UI
        UI -->|Build context from local data| CTX
    end

    subgraph Server["Server (Node.js / Express)"]
        AIProxy[AI Proxy]
    end

    CTX -->|Pre-built context prompt| AIProxy
    AIProxy <-->|AI Provider API| AI[Configured AI]
    AIProxy -->|AI response| UI
```

## The Single Rule

> **If it is static analysis → it runs on the client.**
> **If it requires AI → it goes to the server.**

## What the Server Does (and only this)

The server is intentionally minimal and strictly stateless. It has exactly one job:

1. **AI Proxy**: Receive a fully pre-built context prompt from the client and forward it to the configured AI API. Return the AI response verbatim.

The server does **NOT**:

- Parse ASTs
- Build dependency graphs
- Compute complexity scores
- Detect clones
- Produce risk models or architecture models
- Perform reachability analysis
- Store files, ZIPs, or analysis state of any kind

## What the Client Does (everything else)

The client browser is the full analysis engine:

1. **File Handling**: Processes ZIP uploads entirely in-memory using `JSZip` to extract source code locally.
2. **AST Parsing (Web Worker)**: Runs `web-tree-sitter` (WASM) inside a dedicated `analyzer.worker.js` Web Worker to parse source files without blocking the UI thread.
3. **Symbol Extraction**: Extracts functions, classes, imports, exports, and their locations from the AST.
4. **Graph Construction**: Builds the dependency graph (nodes + edges) and architecture model entirely in-memory from the extracted symbols.
5. **Quality Analysis**: Computes cyclomatic complexity, detects structural code clones across files, and runs reachability analysis for dead code detection.
6. **IndexedDB Persistence**: Stores all analysis results in browser IndexedDB so repeat visits skip re-parsing entirely.
7. **AI Context Building**: Assembles the deterministic facts (graph metrics, hotspots, clones, dead code) into a structured context payload.
8. **AI Prompt Dispatch**: Sends only the pre-built context prompt to the server's AI proxy endpoint.

## Data Flow

```
User uploads ZIP
       ↓
Client reads ZIP in-browser (JSZip) → extracts files in-memory
       ↓
analyzer.worker.js (Tree-sitter WASM) parses files
       ↓
Client builds: Symbol Table → Dependency Graph → Architecture Model → Risk Model
       ↓
Results persisted to IndexedDB
       ↓
Client builds AI context from local models
       ↓
Server receives context prompt → forwards to AI Provider → returns response
```

## Core Services

- **[Client Analysis Worker](../frontend/overview.md)**: `analyzer.worker.js` — the Tree-sitter WASM parser and core analysis pipeline running in a Web Worker.
- **[Client Services](../frontend/overview.md)**: `client/src/services/analyzer/` — graph builders, complexity calculators, clone detectors, reachability analyzers.
- **[Server](../architecture/backend-architecture.md)**: A minimal Express server — AI proxy only, storing zero data.
- **[AI Pipeline](../ai/overview.md)**: The integration with the AI provider for repository Q&A and automated documentation.
