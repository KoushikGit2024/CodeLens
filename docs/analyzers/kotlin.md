# Kotlin Analyzer

The Kotlin analyzer extracts symbols from `.kt` and `.kts` source files using the `tree-sitter-kotlin` WebAssembly grammar.

## Supported Symbol Types

| Symbol Kind  | Kotlin Construct                    |
|-------------|-------------------------------------|
| `package`   | `package com.example.app`           |
| `import`    | `import com.example.Foo`            |
| `class`     | `class Foo`, `data class Foo`, `object Singleton` |
| `interface` | `interface Bar`                     |
| `method`    | `fun doSomething()` (top-level or member) |

## Module Resolution

Kotlin uses dotted-path imports identical to Java (`com.example.Foo`). The module resolver treats `.kt` and `.kts` files the same as `.java` files, converting dotted paths to forward-slash file paths for intra-project resolution:

```
import com.example.Foo  →  com/example/Foo.kt
```

External imports (e.g. `kotlinx.coroutines.*`, `kotlin.collections.List`) are correctly classified as external packages and are not treated as broken links.

## Limitations

- **Annotations** (`@Entity`, `@Composable`) are not extracted as dedicated symbols
- **Extension functions** (`fun String.capitalize()`) are extracted but `className` will be null (they are top-level)
- **Type aliases** (`typealias StringMap = Map<String, String>`) are not extracted
- **Enum entries** within `enum class` are not individually extracted (the enum class itself is)
- **Kotlin script** (`.kts`) files are parsed with the same grammar as `.kt` — script-specific top-level statements are treated as if they were function bodies

## Adding New Constructs

Extend `server/src/analyzers/KotlinParser.js` following the same pattern as `JavaParser.js`. Each new symbol kind should use the factory functions from `symbols.js`.
