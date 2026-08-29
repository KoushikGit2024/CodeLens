# Multi-Language Intelligence

CodeLens is built to natively analyze not just JavaScript and TypeScript, but multiple popular programming languages. By using Tree-sitter, we gain a universal syntax tree that we map into a canonical symbol format, powering the dependency graph, architecture visualization, and AI context seamlessly across languages.

## Supported Languages

| Language | Extensions | Tree-sitter Grammar | Capabilities |
| --- | --- | --- | --- |
| **JavaScript** | `.js`, `.jsx`, `.cjs`, `.mjs` | `tree-sitter-javascript` | Functions, Async, Generators, Arrow, Classes, Methods, Imports (ESM/CJS), Exports. |
| **TypeScript** | `.ts`, `.tsx`, `.cts`, `.mts` | `tree-sitter-typescript` | Same as JS + Interfaces, Types. |
| **Python** | `.py` | `tree-sitter-python` | Functions, Async, Classes, Methods, Decorators, Imports (absolute, relative, alias, wildcard). |
| **Java** | `.java` | `tree-sitter-java` | Classes, Interfaces, Methods, Constructors, Visibility Modifiers, Packages, Imports (wildcard). |
| **C++** | `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` | `tree-sitter-cpp` | Classes, Structs, Namespaces, Functions, Methods, Preprocessor Includes (internal and system). |

## Architecture

The multi-language expansion preserves the unified pipeline established in earlier steps:

1. **Parser Registry**: Each language corresponds to a compiled WebAssembly grammar file (`.wasm`). These are lazy-loaded by `parserRegistry.js` as needed.
2. **Language Detector**: Determines the file's language based on extension.
3. **Base Parser & Factories**: Each language has a dedicated parser class (e.g., `PythonParser.js`) that extends `BaseParser`. It traverses the Tree-sitter AST and extracts symbols into the canonical symbol model defined in `symbols.js`.
4. **Language-Aware Module Resolution**: The dependency graph delegates cross-file linkages to `moduleResolver.js`, which handles language-specific import syntax (e.g. Python's dotted imports or C++'s relative `#include`).
5. **AI Context Builder**: Feeds the exact parsed syntax and relationships to the AI, ensuring watsonx gets accurately grounded data, regardless of the language.

## Limitations

- **Complex C++ Parsing**: Highly sophisticated macro expansion and template resolution are beyond the scope of AST-only static analysis without a full compilation environment.
- **Python Dynamic Imports**: Dynamic `__import__()` or `importlib.import_module()` are not captured.
- **Java Reflection**: Dynamic class loading is invisible to static analysis.
