# ADR-001: Use Tree-sitter (via web-tree-sitter) for AST Parsing

## Status
Accepted

## Date
2025

## Context

CodeLens needs to parse JavaScript and TypeScript source files and extract
structured information: function names, class definitions, import/export
statements, method definitions, and source locations.

### The Problem

Naive approaches to code understanding fail in practice:
- **Regex / string matching**: fragile, breaks on edge cases, cannot handle
  nested structures or multiline declarations reliably.
- **Simple line scanning**: no awareness of language semantics.
- **Runtime evaluation** (`eval`, `require`): security risk, not applicable
  to arbitrary untrusted code.

A proper solution requires a **real parser** that produces an Abstract Syntax
Tree reflecting the full syntactic structure of the source code.

## Considered Approaches

### Option 1: Babel Parser (`@babel/parser`)
- Pure JavaScript, no native dependencies
- Battle-tested, widely used in the JS ecosystem
- Produces a Babel-flavoured AST (ESTree variant)
- Excellent JS/JSX/TS support
- **Limitation**: JavaScript/TypeScript only; extending to other languages
  (Python, Java, C) would require entirely different parsers with different APIs.

### Option 2: Native `tree-sitter` bindings
- The canonical Node.js tree-sitter binding
- Fastest possible performance (native C bindings)
- **Limitation**: Requires compilation via `node-gyp`, which breaks on paths
  containing spaces or special characters (such as `&`). This project's
  directory path contains `&`, making native bindings non-viable without
  moving the project.

### Option 3: `web-tree-sitter` (WASM)
- The same Tree-sitter parser compiled to WebAssembly
- No native compilation required — runs as pure WASM in Node.js
- Identical grammar support and API to native tree-sitter
- Grammar files are pre-compiled WASMs (`tree-sitter-wasms` package)
- Slightly slower than native bindings but negligible for per-file parsing
- Language-agnostic: the same API and abstraction works for any language
  that has a Tree-sitter grammar

## Decision

Use **`web-tree-sitter@0.24.7`** with **`tree-sitter-wasms@0.1.13`**.

## Reasons

1. **Path compatibility**: The project path contains `&` which breaks
   `node-gyp` compilation. `web-tree-sitter` requires no compilation.

2. **Language-agnostic architecture**: Tree-sitter has grammars for 100+
   languages. Adding Python, Java, C, or Go requires only a one-line WASM
   map entry plus a new parser class — no new parsing library is needed.

3. **Production quality**: Tree-sitter is the parser backing GitHub's
   code intelligence, Neovim's syntax highlighting, and many other
   production tools. It handles malformed code gracefully (produces
   partial ASTs with error nodes rather than throwing).

4. **Consistent node types**: Tree-sitter's grammar node types are
   stable and well-documented. The JavaScript and TypeScript grammars
   are maintained by the tree-sitter organisation.

5. **Error tolerance**: Tree-sitter continues to parse after syntax errors,
   returning a partial AST with `ERROR` nodes. This is critical for
   CodeLens: a file with a syntax error should still be partially analysed
   rather than skipped entirely.

## Trade-offs

| Factor | Trade-off |
|--------|-----------|
| Performance | WASM is ~2–5× slower than native C bindings, but still < 5ms per typical file |
| Init cost | WASM binary must be loaded once per process (~100–300ms startup) |
| Bundle size | `web-tree-sitter.wasm` (~2 MB) + per-language WASM (~0.5–1 MB each) |
| API stability | `web-tree-sitter` API changed between 0.22 and 0.24; pinning to `^0.24.7` |
| WASM compatibility | Grammar WASMs built for a specific tree-sitter ABI version; must match runtime |

## Version Compatibility

The WASM ABI must match between the runtime and the grammar files:

| Package | Version | Notes |
|---------|---------|-------|
| `web-tree-sitter` | 0.24.7 | Requires grammars built with dylink format |
| `tree-sitter-wasms` | 0.1.13 | Provides pre-built grammars in the matching format |

The `parserRegistry` resolves WASM paths relative to both `server/node_modules`
and the workspace root `node_modules` to handle npm workspace hoisting.

## Limitations

- TypeScript decorators are parsed but decorator-specific metadata is not
  extracted (not needed for MVP).
- Generic type parameters in TypeScript are not extracted as separate symbols.
- CommonJS `require()` calls are extracted as `ImportSymbol` objects with
  specifier type `'cjs-default'` or `'cjs-named'` (implemented in Step 3).
- The 512 KB file size limit will skip minified bundles, which is intentional.

## Future Alternatives

If native Node.js bindings become viable (e.g. the project is moved to a
path without special characters, or `node-gyp` issues are resolved), the
`parserRegistry` can be updated to use the native `tree-sitter` package
instead of `web-tree-sitter`. The `JavaScriptParser` and `TypeScriptParser`
classes use the same API for both and would require no changes.
