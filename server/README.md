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
│   ├── analyzers/            # Deterministic code analysis engines
│   │   ├── repositoryAnalyzer.js
│   │   ├── dependencyGraph.js
│   │   ├── engineeringRiskAnalyzer.js
│   │   ├── refactoringAnalyzer.js
│   │   ├── architectureAnalyzer.js
│   │   └── repositoryIntelligence.js
│   ├── ai/                   # AI Prompt Builders and Generators
│   │   ├── aiProvider.js
│   │   ├── questionRouter.js
│   │   ├── questionContextBuilder.js
│   │   └── repositoryIntelligenceGenerator.js
│   ├── controllers/          # Express route handlers
│   ├── routes/               # Express API route definitions
│   ├── repositories/         # Local file storage / extraction logic
│   ├── app.js                # Express app configuration
│   └── index.js              # Server entry point
├── tests/                    # Jest unit and integration tests
├── .data/                    # Runtime extracted repositories (git-ignored)
└── package.json
```

## The "Deterministic First" Principle

The backend is strictly divided between `analyzers/` and `ai/`. 
The `analyzers` directory contains zero AI logic. It computes absolute, deterministic facts about the codebase.
The `ai` directory contains context builders that take the deterministic output of the analyzers and pass it to IBM watsonx as structured JSON context. **Code is never blindly dumped into the LLM.**

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
