# ADR-002: Architecture Intelligence Layer

## Status
Accepted

## Context
CodeLens has successfully implemented granular AST extraction (Step 2) and dependency graph resolution (Step 3). However, developers trying to understand an unfamiliar codebase often need a higher-level view (e.g., "What are the core components?", "Which layer depends on which?"). Generating this from scratch using LLMs is error-prone, non-deterministic, and context-window heavy.

## Decision
We decided to implement an **Architecture Intelligence** layer that bridges the gap between deterministic granular data and high-level architectural insights.

1. **Deterministic Component Grouping:** Group files deterministically into components and layers based on file paths and naming conventions (e.g., `controllers/`, `.jsx`).
2. **Deterministic Mermaid Generation:** Translate the component groupings into a `flowchart TD` Mermaid diagram on the backend, ensuring the diagram accurately reflects the actual code structure.
3. **AI Augmentation:** Pass the summarized `ArchitectureModel` to IBM watsonx to generate a text-based architectural summary (responsibilities, tight coupling, risks) instead of asking it to draw the diagram itself.

## Consequences
- **Pros:**
  - Mermaid diagrams are 100% accurate to the source code, avoiding AI hallucinations.
  - Reduced token usage for AI calls because we only send the summarized Architecture Model, not raw files.
  - Resilient UI: if watsonx is unavailable, the user still sees the architecture diagram and component list.
- **Cons:**
  - Component detection relies on heuristics (e.g., `controllers`, `services` directories). Codebases with non-standard structures might all be lumped into `Core/Other`, reducing the usefulness of layer colors.
