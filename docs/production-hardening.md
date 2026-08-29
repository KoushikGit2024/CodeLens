# Production Hardening

CodeLens emphasizes security, robustness, and reliability. As an intelligence tool designed to parse arbitrary user-uploaded codebases, security and deterministic stability are paramount.

## 1. Security 

### Zip Extraction Security
CodeLens mitigates zip slip and path traversal attacks during file extraction:
- **Relative Traversal Guard**: Ensures `path.resolve()` remains strictly within the intended target extraction directory.
- **Absolute Path Guard**: Immediately rejects any entries declaring an absolute system path.
- **Blocked Files**: Prevents extraction of sensitive environment files (e.g., `.env`) and ignores compiled binaries to avoid OOM or execution hazards.

## 2. Deterministic AI Grounding

CodeLens enforces the principle that **Deterministic analysis establishes facts, and AI interprets those facts**. 

To prevent AI hallucinations from poisoning the system:
- **Reference Validation**: File paths extracted from AI responses are cross-checked against the `RepositoryAnalysis` cache. Hallucinated file paths are silently stripped.
- **Line Boundary Validation**: AI-suggested line ranges are bounds-checked against the actual file's `lineCount` computed during the AST phase. Out-of-bounds line pointers are removed before reaching the UI.
- **Fallback Gracefulness**: If the IBM watsonx AI provider times out or returns malformed JSON, the `askController` and `documentationGenerator` controllers gracefully downgrade, returning raw deterministic facts or raw string output without 500ing the application.

## 3. Architecture Integrity

The Architecture Model natively exposes structural anomalies:
- **Cycles**: Circular dependencies between files are exposed via Tarjan/DFS detection.
- **Unresolved Dependencies**: External packages and malformed imports are aggregated and quantified.
- **Isolated Files**: Files without any incoming or outgoing internal edges are labeled as isolated.
