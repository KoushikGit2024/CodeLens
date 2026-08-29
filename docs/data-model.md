# CodeLens — Internal Data Model

## Overview

The analysis layer produces a `RepositoryAnalysis` object containing one
`FileAnalysis` per source file. Each `FileAnalysis` contains an array of
`Symbol` objects.

All types are defined in [`server/src/analyzers/symbols.js`](../server/src/domains/parsing/symbols.js).

---

## Location

All symbol types embed a `location` object.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startLine` | number | ✓ | 1-based line number of the first character |
| `startColumn` | number | ✓ | 0-based column of the first character |
| `endLine` | number | ✓ | 1-based line number of the last character |
| `endColumn` | number | ✓ | 0-based column after the last character |

> tree-sitter uses 0-based rows internally. `locationFromNode()` converts to 1-based lines.

---

## Symbol Types

### FunctionSymbol

A named function declaration (`function foo() {}`).

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'function'` | ✓ | Discriminant | `"function"` |
| `name` | string | ✓ | Function name | `"greet"` |
| `async` | boolean | ✓ | Declared with `async` | `false` |
| `generator` | boolean | ✓ | Declared with `*` | `false` |
| `params` | string[] | ✓ | Parameter names | `["name", "opts"]` |
| `location` | Location | ✓ | Source position | see above |
| `tsKind` | `'type'` | — | Set only for TypeScript type aliases | `"type"` |

```json
{
  "kind": "function",
  "name": "greet",
  "async": false,
  "generator": false,
  "params": ["name"],
  "location": { "startLine": 3, "startColumn": 0, "endLine": 5, "endColumn": 1 }
}
```

---

### ArrowSymbol

An arrow function assigned to a variable (`const foo = () => {}`).

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'arrow'` | ✓ | Discriminant | `"arrow"` |
| `name` | string | ✓ | Variable name | `"handler"` |
| `async` | boolean | ✓ | Declared with `async` | `true` |
| `params` | string[] | ✓ | Parameter names | `["req", "res"]` |
| `location` | Location | ✓ | Source position | |

```json
{
  "kind": "arrow",
  "name": "handler",
  "async": true,
  "params": ["req", "res"],
  "location": { "startLine": 10, "startColumn": 6, "endLine": 12, "endColumn": 2 }
}
```

---

### ClassSymbol

A class declaration (`class Foo extends Bar {}`).

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'class'` | ✓ | Discriminant | `"class"` |
| `name` | string | ✓ | Class name (`'<anonymous>'` if unnamed) | `"UserService"` |
| `superClass` | string\|null | ✓ | Extended class, or `null` | `"BaseService"` |
| `location` | Location | ✓ | Source position | |
| `tsKind` | `'interface'` | — | Set only for TypeScript interfaces | `"interface"` |

```json
{
  "kind": "class",
  "name": "UserService",
  "superClass": null,
  "location": { "startLine": 7, "startColumn": 0, "endLine": 20, "endColumn": 1 }
}
```

---

### MethodSymbol

A method inside a class body.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'method'` | ✓ | Discriminant | `"method"` |
| `name` | string | ✓ | Method name | `"findById"` |
| `className` | string | ✓ | Enclosing class name | `"UserService"` |
| `static` | boolean | ✓ | Is static method | `false` |
| `async` | boolean | ✓ | Is async | `true` |
| `generator` | boolean | ✓ | Is generator | `false` |
| `visibility` | `'public'\|'private'\|'protected'` | ✓ | Access modifier (JS defaults to `'public'`) | `"private"` |
| `params` | string[] | ✓ | Parameter names | `["id"]` |
| `location` | Location | ✓ | Source position | |

```json
{
  "kind": "method",
  "name": "findById",
  "className": "UserService",
  "static": false,
  "async": true,
  "generator": false,
  "visibility": "public",
  "params": ["id"],
  "location": { "startLine": 15, "startColumn": 2, "endLine": 17, "endColumn": 3 }
}
```

---

### ImportSymbol

An ES module import statement.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'import'` | ✓ | Discriminant | `"import"` |
| `source` | string | ✓ | Module specifier (quotes stripped) | `"./auth"`, `"express"` |
| `specifiers` | ImportSpecifier[] | ✓ | What is imported | see below |
| `location` | Location | ✓ | Source position | |

**ImportSpecifier:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Imported name |
| `alias` | string\|null | Local alias (`import { foo as bar }` → alias = `'bar'`) |
| `type` | `'default'\|'named'\|'namespace'\|'side-effect'` | Import kind |

```json
{
  "kind": "import",
  "source": "express",
  "specifiers": [
    { "name": "Router", "alias": null, "type": "named" },
    { "name": "Request", "alias": null, "type": "named" }
  ],
  "location": { "startLine": 1, "startColumn": 0, "endLine": 1, "endColumn": 40 }
}
```

---

### ExportSymbol

An export statement.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `kind` | `'export'` | ✓ | Discriminant | `"export"` |
| `exportType` | `'named'\|'default'\|'reexport'` | ✓ | Export kind | `"named"` |
| `name` | string\|null | — | Exported name (`null` for anonymous default exports) | `"greet"` |
| `source` | string\|null | — | Source module for re-exports | `"./utils"` |
| `location` | Location | ✓ | Source position | |

```json
{
  "kind": "export",
  "exportType": "named",
  "name": "greet",
  "source": null,
  "location": { "startLine": 5, "startColumn": 0, "endLine": 5, "endColumn": 30 }
}
```

---

## FileAnalysis

The complete analysis result for one source file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | string | ✓ | Relative path within repository (forward slashes) |
| `language` | string | ✓ | Detected language: `'javascript'` or `'typescript'` |
| `symbols` | Symbol[] | ✓ | All extracted symbols in source order |
| `hasErrors` | boolean | ✓ | `true` if the parse tree contained syntax errors |
| `error` | string\|null | ✓ | Non-null only if analysis was completely aborted |
| `analyzedAt` | string | ✓ | ISO 8601 timestamp |

---

## RepositoryAnalysis

The top-level result of analysing an entire repository.

| Field | Type | Description |
|-------|------|-------------|
| `status` | `'ready'\|'error'` | Overall status |
| `error` | string\|null | Set if analysis could not start |
| `rootDir` | string | Absolute path (not exposed via API) |
| `analyzedAt` | string | ISO 8601 timestamp |
| `totalFiles` | number | Source files found |
| `analyzedFiles` | number | Files successfully analysed (including those with parse errors) |
| `skippedFiles` | number | Files skipped (unsupported language, too large) |
| `errorFiles` | number | Files where analysis threw an exception |
| `files` | FileAnalysis[] | One entry per source file |
| `languageSummary` | `{[lang]: number}` | File count per language |

### Sample output

```json
{
  "status": "ready",
  "error": null,
  "analyzedAt": "2025-01-01T00:00:00.000Z",
  "totalFiles": 12,
  "analyzedFiles": 11,
  "skippedFiles": 0,
  "errorFiles": 1,
  "languageSummary": { "javascript": 8, "typescript": 4 },
  "files": [
    {
      "filePath": "src/controllers/auth.js",
      "language": "javascript",
      "hasErrors": false,
      "error": null,
      "analyzedAt": "2025-01-01T00:00:00.100Z",
      "symbols": [
        {
          "kind": "import",
          "source": "express",
          "specifiers": [{ "name": "Router", "alias": null, "type": "named" }],
          "location": { "startLine": 1, "startColumn": 0, "endLine": 1, "endColumn": 35 }
        },
        {
          "kind": "function",
          "name": "login",
          "async": true,
          "generator": false,
          "params": ["req", "res"],
          "location": { "startLine": 5, "startColumn": 0, "endLine": 18, "endColumn": 1 }
        }
      ]
    }
  ]
}
```

---

## Dependency Graph (Step 3)

The dependency graph is built on top of `RepositoryAnalysis` by
[`server/src/analyzers/dependencyGraph.js`](../server/src/domains/dependencies/dependency.analyzer.js).

### Node

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable unique ID (`file:<path>` or `pkg:<name>`) |
| `type` | `'file' \| 'package'` | Node type |
| `filePath` | string | *(file nodes only)* Repository-relative path |
| `name` | string | *(package nodes only)* Package name |

### Edge

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Node ID of the importing file |
| `target` | string | Node ID of the imported file/package |
| `type` | `'imports' \| 'requires'` | `imports` = ESM, `requires` = CJS |
| `evidence.specifier` | string | Raw import string as written in source |
| `evidence.importedNames` | string[] | Bound names from the import clause |
| `evidence.location` | Location\|null | Source position |

### DependencyGraph

| Field | Type | Description |
|-------|------|-------------|
| `nodes` | Node[] | All file + package nodes, sorted |
| `edges` | Edge[] | All import/require edges, deduplicated and sorted |
| `meta.totalFiles` | number | Count of file nodes |
| `meta.totalPackages` | number | Count of package nodes |
| `meta.totalEdges` | number | Count of edges |
| `meta.unresolvedImports` | number | Imports that couldn't be resolved |
| `meta.builtAt` | string | ISO timestamp |
| `cycles` | string[][] | Each entry is a cycle path (array of file paths) |
| `isolatedFiles` | string[] | File paths with no edges |

### FileDependencies (from `/graph/file`)

| Field | Type | Description |
|-------|------|-------------|
| `filePath` | string | The queried file |
| `dependencies` | DependencyEntry[] | What this file imports |
| `dependents` | DependencyEntry[] | Files that import this file |
| `externalPackages` | string[] | Bare package names imported |
| `dependencyCount` | number | `dependencies.length` |
| `dependentCount` | number | `dependents.length` |

```json
{
  "filePath": "src/services/authService.js",
  "dependencies": [
    { "filePath": "src/models/User.js",  "edgeType": "imports", "evidence": { "specifier": "../models/User", "importedNames": ["User"], "location": null } },
    { "package": "jsonwebtoken",          "edgeType": "imports", "evidence": { "specifier": "jsonwebtoken",   "importedNames": ["sign"],  "location": null } }
  ],
  "dependents": [
    { "filePath": "src/controllers/authController.js", "edgeType": "imports", "evidence": { "specifier": "../services/authService", "importedNames": ["login"], "location": null } }
  ],
  "externalPackages": ["jsonwebtoken"],
  "dependencyCount": 2,
  "dependentCount": 1
}
```

See [`docs/analyzers/dependency-graph.md`](analyzers/dependency-graph.md) for the full module-resolution and API reference.
