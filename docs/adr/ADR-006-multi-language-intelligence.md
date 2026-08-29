# ADR 006: Multi-Language Intelligence with Tree-sitter

## Status
Accepted

## Context
CodeLens was originally built to analyze JavaScript and TypeScript repositories. To provide value for polyglot microservices and enterprise organizations, the system must support additional languages, specifically Python, Java, and C++.

We need a way to parse these languages deterministically, extract symbols (classes, functions, methods, imports), and map them into our existing language-neutral dependency graph and AI context pipeline without rewriting the core engine.

## Decision
We will extend our existing `web-tree-sitter` implementation to support Python, Java, and C++ using their respective WebAssembly grammars.

We will:
1. Load `tree-sitter-python.wasm`, `tree-sitter-java.wasm`, and `tree-sitter-cpp.wasm` via the `parserRegistry`.
2. Create dedicated parser classes (`PythonParser`, `JavaParser`, `CppParser`) extending `BaseParser`.
3. Add necessary canonical symbol types (e.g. `INTERFACE`, `STRUCT`, `NAMESPACE`) to `symbols.js`.
4. Update `moduleResolver.js` to perform language-aware import resolution (e.g., converting Python `from foo.bar import x` to `foo/bar.py`).

## Rationale
- **Preserve Existing Architecture**: The pipeline from Symbol Extraction -> Dependency Graph -> AI Context remains untouched. We only add new data providers (parsers).
- **Tree-sitter Universality**: Tree-sitter is explicitly designed for this use case. It generates consistent, queryable syntax trees across all languages.
- **Incremental Capabilities Maintained**: By mapping all languages to the same canonical symbol structure, our existing file fingerprinting and incremental impact analysis continue to work perfectly across all languages.

## Consequences
- The initial bundle size (or WASM cache size) increases by a few megabytes due to the additional grammar files.
- `moduleResolver.js` becomes slightly more complex to handle disparate import conventions (e.g., Java packages vs C++ includes).
- Our Monaco Editor implementation in the frontend can seamlessly highlight these files using standard extensions, providing an immediate UI benefit.
