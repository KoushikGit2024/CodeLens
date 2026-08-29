# Refactoring Intelligence

The Refactoring Analyzer (`server/src/analyzers/refactoringAnalyzer.js`) translates structural risks into actionable technical debt remediation strategies.

## Process

1. It consumes the output of the Engineering Risk Analyzer.
2. It maps specific risks to deterministic **Refactoring Strategies** (`refactoringStrategies.js`).
3. For example, if a file has the `HIGH_FAN_OUT` risk, the analyzer assigns the `FACADE_PATTERN` or `EXTRACT_MODULE` refactoring strategy.
4. Each strategy is prioritized (Critical, High, Medium) based on the severity of the underlying risk.

## AI Synergy

The AI Context Builder takes a specific refactoring candidate and feeds it to IBM watsonx. The LLM uses the deterministic strategy assignment and the source file context to generate step-by-step instructions on *how* to apply the refactoring to the specific code in question.
