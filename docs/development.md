# Development Guide

This guide covers how to run the CodeLens application locally and contribute to the codebase.

## Running Locally

CodeLens is configured as an npm workspace. You can run both the client and server concurrently from the root directory.

```bash
npm run dev
```

This command launches:
- **Backend (Server)** on `http://localhost:3001`
- **Frontend (Client)** on `http://localhost:5173`

Alternatively, you can run them individually:
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

## Building for Production

To build the frontend React application for production deployment:

```bash
cd client
npm run build
```

This bundles the application using Vite into the `client/dist/` directory.

## Contributing Guidelines

1. **Deterministic First**: When adding new features that analyze source code, you MUST implement deterministic parsers in the `server/src/analyzers/` directory. Never use the AI (watsonx) to extract structural information (e.g., function names, dependencies).
2. **Update Documentation**: If you add an endpoint, update `docs/api.md`. If you add an analyzer, document it in `docs/analyzers/`. Run `npm run docs:check` to verify no links are broken.
3. **Tests**: Every new analyzer or AI context builder must be covered by a Jest test in `server/tests/`.

See [AGENTS.md](../AGENTS.md) for more details on project philosophies and agent behaviors.
