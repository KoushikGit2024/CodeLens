# ADR-004: Deterministic-First Repository Intelligence

**Date:** 2026-08-29  
**Status:** Accepted  

## Context
CodeLens requires a robust Question and Answer feature for repositories (Step 8). The previous implementation (Step 4) relied purely on a semantic scoring system that gathered files and passed them directly to the AI, returning an unstructured text string. This led to issues where deterministic questions (e.g., "What are the dependencies of X?") would consume token budget and potentially hallucinate answers, while complex questions lacked a structured presentation of facts vs inferences.

## Decision
We implemented a **Deterministic-First Repository Intelligence** system.
1. **Question Intent Router**: Questions are analyzed and routed (`METRICS`, `DEPENDENCY`, `ARCHITECTURE`, `GENERAL`).
2. **Context Extraction**: The context builder pulls targeted information (e.g., just the dependencies graph, or just the architecture components) rather than full file sources, unless explicitly required.
3. **Deterministic Fast-Path**: Questions that can be answered entirely by existing AST or Graph data (e.g., "What depends on X?") bypass the AI provider completely and are returned directly by the system.
4. **Structured Generation**: When AI is required, we enforce a strict JSON output schema (`{ summary, explanation, facts, inferences, references, limitations }`) to decouple factual evidence from AI-generated conclusions.

## Consequences

### Positive
- **Cost & Latency:** Deterministic fast-paths resolve in milliseconds without API calls.
- **Hallucination Prevention:** By separating facts from inferences, users can immediately identify when an LLM is speculating vs reporting structural truth.
- **Resilience:** If the AI provider is unavailable, the system gracefully falls back to returning the gathered deterministic facts in the structured response.

### Negative
- **Routing Complexity:** The heuristic router is simple but may misclassify nuanced questions. A more advanced classifier may be needed in the future.
- **UI Complexity:** The frontend must render complex structured JSON instead of simple markdown prose.

## Alternatives Considered

Not documented for this ADR.

## Related Documentation

Not documented for this ADR.
