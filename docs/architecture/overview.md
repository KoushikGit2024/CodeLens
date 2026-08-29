# System Architecture Overview

CodeLens is a modern, decoupled web application that follows a "Deterministic First, AI Second" philosophy. The architecture consists of three main components: a React/Vite client, an Express/Node.js server, and the IBM watsonx AI service.

## High-Level Architecture

```mermaid
graph TD
    Client[Client Browser (React/Vite)]
    Server[Node.js / Express Server]
    AST[AST Analyzers (web-tree-sitter)]
    Graph[Dependency & Architecture Graph]
    AI[IBM watsonx AI]
    LocalFileSystem[(Local Repository Store)]

    Client <-->|REST API| Server
    Server -->|Upload & Extract| LocalFileSystem
    Server -->|Read Source| AST
    AST -->|Generate Symbols| Graph
    Graph -->|Generate Context| Server
    Server <-->|Prompt & Context| AI
```

## The "Deterministic First" Principle

CodeLens strictly enforces a layered architecture to ensure that AI hallucination is minimized and performance is maximized:

1. **Deterministic Analysis Layer**: CodeLens parses raw source code into an Abstract Syntax Tree (AST) using Tree-sitter. It extracts canonical symbols, dependencies, cycles, components, and refactoring candidates using pure determinism.
2. **Context Assembly Layer**: The deterministic facts are compiled into a bounded JSON context schema.
3. **AI Interpretation Layer**: The AI is ONLY provided with the bounded context, never the raw source code. It is tasked with synthesizing, summarizing, and explaining the facts.

By separating these layers, CodeLens ensures that metrics like cyclomatic complexity, circular dependencies, and file sizes are always 100% accurate, while the AI is used for what it does best: natural language synthesis.

## Core Services

- **[Client](../frontend/overview.md)**: A rich, interactive React application using Monaco Editor for code viewing and Mermaid.js / React Flow for visualizations.
- **[Server](../architecture/backend-architecture.md)**: An Express backend that orchestrates the entire intelligence pipeline.
- **[Analyzers](../analyzers/)**: The suite of AST parsers and graph analyzers that generate the deterministic repository model.
- **[AI Pipeline](../ai/overview.md)**: The integration with IBM watsonx for repository Q&A and automated documentation.
