# CodeLens — Contributor & Agent Guide

This document defines the rules, philosophies, and operational guidelines for developing the CodeLens system. **All AI Agents and human contributors must follow these instructions.**

## 1. The Core Philosophy: Deterministic First, AI Second

CodeLens is NOT a generic chat wrapper around a repository. 

**Rule:** AI must NEVER replace deterministic analysis when facts can be obtained from the repository itself.

- **Bad**: Passing raw source code to Watsonx and asking "What are the dependencies of this file?"
- **Good**: Using `web-tree-sitter` to parse the AST, extracting the imports, building a `DependencyGraph`, and passing the computed graph to Watsonx to ask "Can you explain why this dependency structure is highly coupled?"

The backend is strictly divided between `server/src/analyzers/` (pure determinism) and `server/src/ai/` (context formatting and Watsonx API calls).

## 2. Testing Requirements

- CodeLens maintains 100% passing tests. 
- You MUST run `npm test` from the `server` directory before and after making changes.
- Note: If `npm test` fails due to path constraints (e.g., an `&` in the path name), use `node ../node_modules/jest/bin/jest.js --runInBand --forceExit`.
- Every new analyzer or AI intent MUST have corresponding Jest tests.

## 3. Documentation Requirements

- Documentation is a first-class citizen. 
- If you add a new endpoint, you MUST update `docs/api.md`.
- If you add a new analyzer, you MUST document it in `docs/analyzers/`.
- After modifying any documentation, you MUST run `npm run docs:check` from the root directory to ensure no relative markdown links are broken.

## 4. Git and Security Rules

- CodeLens operates in its own project-local Git repository. Do NOT modify the parent repository.
- Do NOT alter `.gitignore` to track `node_modules`, `.env`, `.bob/`, `.agents/`, `dist/`, or temporary `.data/` folders.
- Do NOT commit API keys or environment secrets.
- Always use relative forward-slash paths internally.

## 5. State Management & Storage Philosophy

**Rule:** The backend must remain strictly stateless regarding user interactions (like AI chat histories, UI preferences, or session state).
- The `.data/` folder is exclusively for persisting **repository source code and deterministic analysis/AST structures**. It is designed to be fully reproducible if deleted.
- When deployed, the backend filesystem may be ephemeral. Therefore, **user-specific data (like AI chats) MUST be stored locally on the client (e.g., using browser `localStorage`)**. Do not pollute the backend `.data/` directory with ephemeral or user-generated UI state.

## 6. Development Commands

From the root directory:

- **Run Dev**: `npm run dev` (Starts both client and server via concurrently)
- **Install**: `npm run install:all`
- **Check Docs**: `npm run docs:check`
- **Test Server**: `npm test`

From the `client` directory:
- **Build Frontend**: `npm run build`

## 6. Extension Guidelines

When adding a new intelligence capability:
1. First, build the deterministic extraction logic in `analyzers/`.
2. Second, build the API endpoint in `controllers/` and `routes/`.
3. Third, if the user needs an AI explanation, build a Context Builder in `ai/`.
4. Fourth, build the UI visualization in `client/src/pages/`.
5. Fifth, update `docs/`.

## 7. Current Project State
We have completed up to **Step 19** (End-to-End Product Integration, UX, Guided Workflow & Feature Reliability). The system now functions as a unified, production-grade developer tool with a canonical guided workflow, deep-link parity across features, and resilient offline/deterministic fallbacks.
