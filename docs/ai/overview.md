# AI Pipeline Overview

CodeLens integrates IBM watsonx to provide natural language explanations, automated documentation, and refactoring advice. However, it operates on a strict **"Deterministic First"** principle.

## The Problem with Naive AI Integration

Dumping an entire repository's source code into an LLM context window is inefficient, expensive, and leads to severe hallucinations. The LLM loses track of structural relationships and often invents APIs that don't exist.

## The CodeLens Solution

1. CodeLens uses Tree-sitter and Graph algorithms to extract 100% accurate, deterministic facts (symbols, dependencies, cycles).
2. The AI is fed a highly structured, bounded JSON context containing these facts.
3. The AI's prompt forces it to synthesize the facts into human-readable explanations, rather than asking it to guess how the code works.

## Fallbacks and Safety

If the IBM watsonx provider is unconfigured or unavailable, CodeLens gracefully falls back to displaying the raw deterministic facts. AI is an enhancement layer, not a structural dependency.
