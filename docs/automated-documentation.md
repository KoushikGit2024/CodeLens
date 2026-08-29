# Automated Documentation Intelligence

CodeLens Step 7 introduces the Automated Documentation Intelligence layer. This feature synthesizes the deterministic intelligence from the AST analyzer (Step 2), Dependency Graph (Step 3), and Architecture Analyzer (Step 6) and merges it with AI insights from IBM watsonx to produce accurate, structured, and developer-friendly documentation.

## Purpose

Automated documentation answers high-level questions like:
- What does this project do?
- How is it architected?
- What is the primary responsibility of a given file?
- Which files depend on this file?

Instead of dumping raw source code into an LLM and hoping for an accurate summary (which is token-heavy and prone to hallucinating non-existent dependencies), CodeLens uses a deterministic-first approach.

## The Pipeline

1. **Deterministic Facts:** The backend extracts structural facts using Tree-sitter (imports, exports, layers, entry points).
2. **Context Builder:** `documentationContextBuilder.js` extracts a targeted subset of these facts based on the documentation requested (Overview vs Module).
3. **AI Generation:** `documentationGenerator.js` prompts IBM watsonx with the deterministic facts, asking for specific interpretations (e.g. responsibilities, inferences).
4. **Validation:** The AI response is parsed as structured JSON.
5. **Presentation:** The frontend `DocumentationPage.jsx` renders the combined facts and AI interpretations in a clean, readable format.

## Documentation Types

### 1. Repository Overview (`/overview`)
Provides a high-level summary of the repository.
- **Deterministic Facts:** Total files, entry points, key external packages, architectural components.
- **AI Interpretation:** Project summary, technology stack inferred, architectural observations.

### 2. Module / File Documentation (`/file?path=...`)
Provides detailed documentation for a specific file.
- **Deterministic Facts:** Component, layer, exports, dependencies, dependents, API boundary status.
- **AI Interpretation:** Module responsibility, architectural role, API notes, inferred dependency purpose.

## Data Model

The JSON structure returned by the documentation API strictly separates facts from AI interpretations:

```json
{
  "facts": {
    "projectName": "test-repo",
    "meta": { "totalFiles": 45 },
    "components": [...],
    "keyExternalPackages": [...]
  },
  "aiInterpretation": {
    "summary": "This repository is a Node.js API backend...",
    "technologies": ["Express", "React"],
    "observations": [...]
  }
}
```

## AI Failure Fallback

A core requirement is that documentation remains available even if the IBM watsonx provider is unconfigured, unreachable, or returns malformed output.
If the AI fails, the `aiInterpretation` field is set to `null`, and the frontend continues to render the structural facts seamlessly with a notice indicating the AI is unavailable.

## Security & Privacy

Documentation context strictly only includes filenames, component names, and symbol names (exports). It **never** includes the raw contents of `.env` files, secrets, or arbitrary code contents, inherently mitigating risks associated with sending sensitive data to external AI models.

## API Endpoints

- `GET /api/repository/:id/documentation/overview` — Retrieves the repository-wide documentation.
- `GET /api/repository/:id/documentation/file?path=...` — Retrieves documentation for a specific file.

*Note: Documentation generation can take a few seconds on the first request. The backend caches results in memory to ensure fast subsequent fetches.*
