# Testing

CodeLens uses **Jest** for backend testing, covering parsers, context builders, and API endpoints.

## Running Tests

From the root directory, you can run:

```bash
npm test
```

This executes `cd server && npm test`.

### Important Note for Windows Users

If your project path contains special characters like `&` (e.g., `C:\User & Profiles\CodeLens`), running `npm test` may fail due to how npm resolves binaries.

To safely run tests bypassing npm's binary wrapper, use:
```bash
cd server
node ../node_modules/jest/bin/jest.js --runInBand --forceExit
```

## Test Organization

Tests are located in `server/tests/`:

- `analyzers/`: Unit tests for AST parsers, module resolvers, dependency graphs, architecture detection, engineering risk, refactoring intelligence, and unified repository intelligence.
- `ai/`: Unit tests for context builders, prompt generators, and the intent router.
- `api/`: Integration tests using `supertest` for all Express controllers.

## Coverage Requirements

CodeLens maintains a high test coverage. Any new analyzer or API endpoint must include comprehensive tests. 
Because the AI relies on deterministic facts, the parsers and context builders must be rock-solid.
