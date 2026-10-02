# ADR-012: Client-Dominant Analysis Architecture

## Status

Accepted

## Date

2026

## Context

CodeLens was originally built with the server as the primary analysis engine. The server ran Tree-sitter AST parsing, built dependency graphs, computed complexity scores, and detected clones — all in Node.js. The client was a pure visualization layer.

### Why This Was Changed

As the system matured, this architecture created fundamental friction:

1. **Unnecessary server complexity**: Static analysis is a pure computational task with no side effects. There is no reason it must run on a remote server.
2. **Round-trip latency**: Every analysis result required a network round-trip, even for simple recomputations.
3. **Browser capability**: `web-tree-sitter` is a WASM library specifically designed to run in browsers. Web Workers allow CPU-intensive tasks to run off the main thread without freezing the UI. IndexedDB provides persistent client-side caching. The browser is fully capable of hosting the entire analysis pipeline.
4. **Correct separation of concerns**: The only thing the client genuinely cannot do is call external AI APIs (requires secret API keys). Everything else is the client's responsibility.

## Decision

Adopt a **Client-Dominant Analysis Architecture** where the server is strictly an **AI proxy** with zero analysis intelligence and zero data storage.

### The Single Rule

> **If it is static analysis → it runs on the client.**
> **If it requires AI → it goes to the server.**

### Server Responsibilities (exhaustive list)

The server is intentionally minimal and strictly stateless. It has exactly one role:

| Responsibility | What It Means                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| AI proxy       | Receive a pre-built prompt from the client → forward to AI provider → return response. Does not build the prompt. |

### Client Responsibilities (everything else)

| Responsibility                 | Implementation                                           |
| ------------------------------ | -------------------------------------------------------- |
| File handling                  | Processes ZIP uploads in-browser via `JSZip`             |
| AST parsing                    | `web-tree-sitter` WASM in `analyzer.worker.js`           |
| Symbol extraction              | Parser classes in `client/src/services/analyzer/`        |
| Dependency graph construction  | Graph builder in `client/src/services/analyzer/`         |
| Architecture model building    | Architecture analyzer in `client/src/services/analyzer/` |
| Cyclomatic complexity          | Complexity service in `client/src/services/analyzer/`    |
| Cross-file clone detection     | Clone detector in `client/src/services/analyzer/`        |
| Dead code / reachability       | Reachability service in `client/src/services/analyzer/`  |
| Risk model and hotspot scoring | Risk builder in `client/src/services/analyzer/`          |
| Result persistence             | Browser IndexedDB                                        |
| AI context assembly            | Context builder in `client/src/services/`                |

## Consequences

### Positive

- The server becomes trivially simple — a thin HTTP layer with no domain knowledge.
- All analysis is instantaneous after initial parse (no network round-trips).
- The browser's IndexedDB cache means repeat visits are fast with zero server load.
- Complete separation: the server never needs to understand code structure at all.

### Negative

- Initial parse may be slightly slower on low-end devices (WASM in browser). Mitigated by Web Worker offloading and IndexedDB caching.
- Client bundle size increases due to WASM grammar files. Mitigated by lazy-loading.

## Migration Note

The server currently still contains legacy analysis code in `server/src/domains/` (e.g., `complexity.analyzer.js`, `reachability.analyzer.js`, `clone.analyzer.js`) from the earlier architecture. These are **transitional** artifacts. Any new analysis feature MUST be built client-side. Legacy server analyzers should be migrated to the client progressively.

## Related ADRs

- [ADR-001](ADR-001-tree-sitter.md) — Tree-sitter selection; WASM compatibility with browsers was a key reason for this decision.
- [ADR-005](ADR-005-incremental-analysis.md) — Incremental caching migrates from server disk to client IndexedDB.
