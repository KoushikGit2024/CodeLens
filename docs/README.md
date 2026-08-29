# CodeLens Documentation

Welcome to the CodeLens Knowledge Base. CodeLens is an AI-Driven Code Intelligence and Automated Documentation System. 

<div align="center">
  <b>START HERE</b><br/>
  ↓
</div>

## Getting Started

1. [Getting Started](getting-started.md) — Installation and `.env` configuration.
2. [Development Guide](development.md) — Running the app locally and contribution rules.
3. [Testing](testing.md) — Test setup and Jest commands.
4. [Security](security.md) — Sandbox protections and limits.

## Core System Architecture

Understand how CodeLens works from the ground up:

1. [Architecture Overview](architecture/overview.md) — The High-level components.
2. [Data Flow](architecture/data-flow.md) — End-to-end pipeline (ZIP to AI).
3. [Analysis Layer](architecture/analysis-layer.md) — In-depth deterministic architecture.
4. [Backend Architecture](architecture/backend-architecture.md) — Node.js Express server.
5. [Frontend Overview](frontend/overview.md) — React/Vite SPA.

## Code Intelligence Subsystems

These are the deterministic engines that extract absolute facts from the repository:

- [Tree-sitter Parsing](analyzers/tree-sitter.md)
- [Dependency Graph](analyzers/dependency-graph.md)
- [Architecture Intelligence](analyzers/architecture-analyzer.md)
- [Engineering Health & Risk](analyzers/engineering-risk.md)
- [Refactoring Intelligence](analyzers/refactoring-intelligence.md)
- [Incremental Analysis](analyzers/incremental-analysis.md)
- [Change Impact](analyzers/change-impact.md)
- [Unified Repository Intelligence](repository-intelligence-overview.md)
- [Multi-Language Intelligence](multi-language-intelligence.md)

## AI Interpretations

How IBM watsonx is integrated safely and effectively:

- [AI Pipeline Overview](ai/overview.md)
- [AI Context Building](ai/context-building.md)
- [AI Context Schema](ai-context.md)
- [Automated Documentation](automated-documentation.md)

## Reference

- [API Documentation](api.md) — Exhaustive REST endpoints.
- [Data Model](data-model.md) — The schema for extracted Symbols.
- [Architecture Decision Records (ADRs)](adr/README.md) — History of technical decisions.
