# AI Context Building

The `server/src/ai/` directory contains specialized Context Builders (`questionContextBuilder.js`, `documentationContextBuilder.js`, etc.).

## Purpose

Instead of sending raw code to the LLM, Context Builders construct minimal, token-efficient JSON objects representing only the facts relevant to the task.

## Example: Question Context Builder

When a user asks a question in the Repository Assistant:
1. `questionRouter.js` classifies the intent of the question (e.g., `FIND_SYMBOL`, `EXPLAIN_DEPENDENCIES`).
2. `questionContextBuilder.js` extracts only the relevant subsets of the AST and Graph (e.g., if the user asks about "AuthService", it only includes the `AuthService` class and its immediate imports).
3. The context is JSON.stringified and embedded into the prompt.

## Reference Validation

When the AI responds, it is instructed to provide source file references. CodeLens validates these references against the deterministic file tree to ensure the AI did not hallucinate a file path.
