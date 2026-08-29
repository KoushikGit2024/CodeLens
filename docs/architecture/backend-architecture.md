# Backend Architecture

The backend of CodeLens is a Node.js/Express application designed to handle high CPU loads (AST parsing) while serving a REST API to the frontend.

## Directory Structure

```
server/src/
├── app.js               # Express application setup, middleware
├── index.js             # Server entry point, starts on port 3001
├── routes/              # Express routers defining API endpoints
├── controllers/         # Request handlers linking routes to analyzers
├── repositories/        # Repository store (manages extracted ZIPs)
├── analyzers/           # The core intelligence engines
└── ai/                  # Integrations with IBM watsonx and prompt builders
```

## Analyzers Layer

The `analyzers/` directory contains all pure, deterministic logic for analyzing a repository.

- **`repositoryAnalyzer.js`**: The main orchestrator that scans the filesystem and runs parsers.
- **`parserRegistry.js`**: Initializes WebAssembly grammars.
- **`dependencyGraph.js`**: Constructs the node/edge network.
- **`architectureAnalyzer.js`**: Detects components and layers.
- **`engineeringRiskAnalyzer.js`**: Calculates health scores.
- **`repositoryIntelligence.js`**: Aggregates all data for the frontend dashboard.

## AI Layer

The `ai/` directory is strictly separated from the analyzers. It relies entirely on the outputs of the `analyzers/` directory.

- **Context Builders**: Scripts like `questionContextBuilder.js` serialize AST and graph data into JSON context.
- **Generators**: Scripts like `documentationGenerator.js` format prompts and handle the watsonx API lifecycle.
- **AI Provider**: `aiProvider.js` acts as an abstraction layer over IBM watsonx.

## Storage and Lifecycle

1. Uploaded ZIP files are stored temporarily.
2. `repositoryStore.js` extracts the ZIP into a secure `.data/` sandbox.
3. The repository ID is generated (UUID), and all subsequent API requests reference this ID.
4. Caching and fingerprinting (`fingerprint.js`) ensure that incremental analysis avoids re-parsing unchanged files.
