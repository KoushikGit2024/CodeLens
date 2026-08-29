# Unified Repository Intelligence

CodeLens provides a **Unified Repository Intelligence Layer** (Step 14) that serves as the primary orientation dashboard for developers onboarding to a new codebase.

## Purpose

Instead of making developers click through separate tabs (Architecture, Dependency Graph, Engineering Health, Refactoring) to manually synthesize an understanding of the repository, the Unified Repository Intelligence dashboard brings all these deterministic facts together into one concise overview.

## Deterministic Data Model

The intelligence model aggregates facts without re-parsing the source code:
- **Repository**: Files, languages, line limits.
- **Architecture**: Components, layers, and entry points.
- **Dependencies**: Total nodes, edges, cycles, and unresolved imports.
- **Engineering Health**: Overall score, critical risks, and warnings.
- **Refactoring**: Top technical debt candidates prioritized by impact and severity.

## Hotspot Detection

To help developers know exactly *where* to start reading, CodeLens features a deterministic **Hotspot Detection Algorithm**. Files are scored based on:
1. **Size/Complexity**: Files exporting or defining large numbers of symbols.
2. **Coupling (Fan-in/Fan-out)**: Files with unusually high outgoing dependencies (coordinators) or extremely high incoming dependencies.
3. **Architecture**: Whether the file is an application entry point.
4. **Risk Profile**: Whether the file is involved in critical refactoring candidates (e.g., circular dependencies).

Shared utilities (high fan-in but low complexity) are bounded to prevent them from being incorrectly flagged as problematic hotspots.

## AI Repository Assistant

The dashboard includes an **"Understand Repository"** action. When clicked, CodeLens feeds the *deterministic repository summary* into IBM watsonx. The AI is instructed to synthesize these facts into a cohesive explanation, highlighting the main architecture patterns, critical risks, and recommended first steps.

Because the AI only sees the aggregated facts and not the entire raw source tree, hallucination is minimized, and performance is maximized.

## API Endpoint

- `GET /api/repository/:id/intelligence`
  Returns the deterministic JSON model aggregating all repository intelligence.

## CI/CD Integration

The headless CI report (`GET /api/repository/:id/ci-report`) now includes a high-level `intelligence` block containing the overall health score and top hotspot, allowing automated pipelines to track repository degradation over time.
