# CodeLens Backend

This directory contains the Node.js/Express server that powers CodeLens.

## Responsibilities

The backend orchestrates the entire intelligence pipeline. It extracts uploaded repositories into a sandbox, parses the code into ASTs using WebAssembly Tree-sitter grammars, builds dependency graphs, analyzes architecture, detects engineering risks, and communicates with IBM watsonx for AI synthesis.

## Technology Stack

- **Node.js 18+**
- **Express.js**
- **web-tree-sitter** (AST parsing)
- **Multer / Adm-Zip** (Upload and extraction)
- **Jest** (Testing)
- **IBM watsonx SDK** (AI Provider)

## Folder Structure

```text
server/
├── src/
│   ├── core/                 # Infrastructure, server setup, and base AI
│   │   ├── server.js         # Server entry point
│   │   ├── app.js            # Express app configuration
│   │   ├── utils/            # Shared utilities
│   │   ├── middleware/       # Express middleware
│   │   └── ai/               # AI provider clients (Watsonx)
│   ├── domains/              # Feature-oriented vertical slices
│   │   ├── repository/       # Upload, storage, and persistence
│   │   ├── parsing/          # AST generation and language detection
│   │   ├── dependencies/     # Dependency graph construction
│   │   ├── architecture/     # Component mapping and diagrams
│   │   ├── engineering/      # Health, risks, and refactoring
│   │   └── assistant/        # Q&A routing and generators
├── tests/                    # Jest test suites (mirroring domains/)
├── .data/                    # Runtime extracted repositories (git-ignored)
└── package.json
```

## The "Deterministic First" Principle

The backend is strictly divided between deterministic domains (e.g., `parsing/`, `dependencies/`) and AI generation (e.g., `assistant/generators/`). 
The core domains contain zero AI logic. They compute absolute, deterministic facts about the codebase.
The `assistant/context/` builders take the deterministic output of the domains and pass it to IBM watsonx as structured JSON context. **Code is never blindly dumped into the LLM.**

## Running Locally

```bash
cd server
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

## Testing

```bash
cd server
npm test
```

We use Jest. Notice that `node_modules/jest/bin/jest.js` may need to be invoked directly using `node` if the project directory path contains an ampersand (`&`), which can break standard npm binary execution on Windows.
