# ADR-003: Deterministic-First Automated Documentation

**Date:** 2026-08-29  
**Status:** Accepted  

## Context
CodeLens requires an automated documentation generation system (Step 7). Generating accurate documentation for an entire repository purely using Large Language Models (LLMs) poses several risks:
- **Token Limits:** Large repositories exceed context window sizes, requiring complex chunking, RAG (Retrieval-Augmented Generation), or vector databases.
- **Hallucinations:** LLMs frequently hallucinate dependencies, imports, and exports that do not actually exist in the codebase.
- **Performance:** Sending full file contents for an entire repository to an LLM provider simultaneously can trigger rate limits or timeouts.

## Decision
We decided to adopt a **deterministic-first, AI-augmented** approach for documentation generation.

1. **Deterministic Foundation:** We rely on the `RepositoryAnalysis` (Tree-sitter), `DependencyGraph`, and `ArchitectureModel` (Step 6) to gather 100% accurate, factual data about the repository.
2. **Context Assembly:** Instead of sending source code to the LLM, we send the structured *facts* (e.g., "This module is in the Service layer, exports 'login', and depends on 'authUtils'").
3. **Targeted AI Interpretation:** We prompt IBM watsonx to interpret these facts and generate high-level architectural insights and responsibility summaries in structured JSON.
4. **Lazy Generation:** Documentation is generated on-demand when a user visits a specific documentation page (Overview or Module), rather than upfront during repository analysis. This distributes API calls over time.

## Consequences

### Positive
- **High Accuracy:** It is impossible for the system to hallucinate dependencies or exports, as these are rendered directly from the deterministic facts.
- **Graceful Degradation:** If the AI provider is unavailable or fails to generate valid JSON, the system still displays a comprehensive documentation page using the structural facts.
- **Cost and Performance:** Bypassing full-text code transmission drastically reduces token usage and latency.
- **Simplicity:** No need for complex vector databases, embeddings, or RAG infrastructure.

### Negative
- **Context Loss:** The AI does not read the raw source code of functions (only their signatures/names), meaning its summaries rely on good naming conventions in the repository.
- **UI Complexity:** The frontend must merge two separate data structures (`facts` and `aiInterpretation`) gracefully.
