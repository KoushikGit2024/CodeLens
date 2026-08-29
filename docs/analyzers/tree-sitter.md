# Tree-sitter AST Parsing

CodeLens uses `web-tree-sitter` (Tree-sitter compiled to WebAssembly) to deterministically parse source code into Abstract Syntax Trees (ASTs).

## Why Tree-sitter?

Tree-sitter is a fast, robust parser generator tool. It builds concrete syntax trees that are highly resilient to syntax errors (it returns partial ASTs with `ERROR` nodes rather than throwing exceptions). We use the WebAssembly bindings (`web-tree-sitter`) rather than native bindings to avoid `node-gyp` compilation issues on complex local paths.

See [ADR-001](../adr/ADR-001-tree-sitter.md) for more details.

## The Parser Registry

`server/src/analyzers/parserRegistry.js` handles loading the WASM binaries and mapping file extensions to the appropriate parser. 

Currently supported languages:
- JavaScript / JSX
- TypeScript / TSX
- Python
- Java
- C / C++

## Symbol Extraction

For each language, a specific parser class (e.g., `JavaScriptParser.js`, `PythonParser.js`) is responsible for traversing the Tree-sitter AST and mapping it to the CodeLens canonical symbol schema (`symbols.js`).

### Supported Extractions
- Classes and Methods
- Functions (Async, Generators, Arrow)
- Imports (ESM, CommonJS, Python imports, Java imports)
- Exports
- TypeScript Interfaces and Types

## Error Handling

If a file exceeds a predefined size limit (to prevent memory crashes on large bundled files), it is skipped and marked with an error. If a file contains syntax errors, Tree-sitter parses what it can, and the file is marked with `hasErrors: true`, but extraction still proceeds on the valid portions of the AST.
