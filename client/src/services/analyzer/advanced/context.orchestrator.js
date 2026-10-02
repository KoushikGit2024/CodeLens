/**
 * context.orchestrator.js
 * 
 * Orchestrates AI Context by standardizing how CodeLens talks to the LLM.
 * This decoupled layer extracts prompt engineering from the API bridge, paving the way 
 * for AST-scoped context, graph neighbor injection, and structured outputs.
 */

export class ContextOrchestrator {
  
  static buildArchitecturePrompt(model) {
    return `You are a software architect analyzing a codebase.
Provide a clear, 2-3 paragraph architectural evaluation based on these metrics.

Components: ${model.components.map(c => c.data.label).join(', ')}
Total Relations: ${model.relations.length}
Boundary Violations: ${model.violations.length}
Entry Points: ${model.entryPoints.join(', ')}

Evaluate the modularity, coupling, and any apparent risks based on the violations.`;
  }

  static buildIntelligencePrompt(intelligence) {
    const langs = Object.entries(intelligence.repository.languages || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([l, n]) => `${l} (${n} files)`).join(', ');

    const hotspotList = (intelligence.hotspots || []).slice(0, 5)
      .map(h => `  - ${h.filePath} (hotspot score: ${h.score})`).join('\n');

    const topCandidates = (intelligence.refactoring.topCandidates || [])
      .map(c => `  - ${c.title} [${c.priority}]`).join('\n');

    return `You are CodeLens, a senior software architect and code intelligence assistant.
Analyze the following deterministic repository metrics and produce a clear, concise, high-level overview.

REPOSITORY: ${intelligence.repository.name}
FILES: ${intelligence.repository.fileCount} source files
LANGUAGES: ${langs}

ARCHITECTURE:
- ${intelligence.architecture.components} detected components
- Layers: ${(intelligence.architecture.layers || []).join(', ') || 'N/A'}

DEPENDENCY GRAPH:
- ${intelligence.dependencies.nodes} nodes, ${intelligence.dependencies.edges} edges
- Circular dependencies: ${intelligence.dependencies.cycles}

ENGINEERING HEALTH:
- Overall score: ${intelligence.engineeringHealth.score}/100
- Critical issues: ${intelligence.engineeringHealth.critical}
- High-severity issues: ${intelligence.engineeringHealth.high}
- Warnings: ${intelligence.engineeringHealth.warnings}

REFACTORING:
- ${intelligence.refactoring.candidateCount} candidate(s) identified (${intelligence.refactoring.critical} critical, ${intelligence.refactoring.high} high)
- Top candidates:
${topCandidates || '  None'}

TOP HOTSPOT FILES:
${hotspotList || '  None identified'}

Provide a 3-5 paragraph technical summary covering: overall codebase health, main architectural observations, key risks to address, and recommended immediate actions.`;
  }

  static buildRisksPrompt(risks) {
    return `You are a senior technical lead reviewing engineering health metrics.
Overall Score: ${risks.score}
Critical Risks: ${risks.risks.filter(r => r.severity === 'critical').length}
High Risks: ${risks.risks.filter(r => r.severity === 'high').length}
Total Hotspots: ${risks.hotspots.length}

Please provide a 2-3 paragraph interpretation of these metrics, highlighting what the most critical areas of concern might be and what a general mitigation strategy should look like.
Format the output as JSON with the following structure:
{
  "summary": "High level interpretation text",
  "limitations": "Potential limitations or risks text"
}`;
  }

  static buildRefactoringStrategyPrompt(candidate) {
    return `You are an expert software architect. Analyze the following refactoring candidate and provide a detailed strategy.
Title: ${candidate.title}
Summary: ${candidate.summary}
Affected Files: ${candidate.files?.join(', ')}
Severity: ${candidate.severity}

Generate a structured JSON response matching this exact schema:
{
  "summary": "A 1-paragraph summary of the approach",
  "recommendations": [
    {
      "strategy": "Name of the strategy",
      "reasoning": "Why this is recommended",
      "steps": ["Step 1", "Step 2"]
    }
  ],
  "limitations": ["Risk 1", "Limitation 1"]
}`;
  }

  static buildAutoFixPrompt(candidate, targetFile, originalCode, impactConstraints, specificEvidenceText, strategiesText, snippetContext = "") {
    return `You are an expert AI software architect. Please refactor the following file to resolve the issue: "${candidate.title}".
Category: ${candidate.type}
Description: ${candidate.summary}
${specificEvidenceText}
${impactConstraints}

Recommended Strategies:
${strategiesText}

Please provide ONLY the fully refactored source code chunk that replaces the problematic code. Do not output the entire file. Use a markdown code block containing your refactored code chunk. We will apply this as a replacement.

File: ${targetFile} ${snippetContext}
Original Code Snippet:
\`\`\`
${originalCode}
\`\`\`
`;
  }

  static buildGenerateTestsPrompt(candidate, targetFile, originalCode) {
    return `You are an expert Software Engineer in Test (SDET). We are planning to refactor the following file to resolve an issue ("${candidate.title}"). 
To ensure safety, we need baseline tests BEFORE refactoring.

Please write a comprehensive suite of unit tests (using Jest or similar standard testing framework) for the current implementation of this file. Focus on capturing the existing behavior.

Please provide ONLY the fully working test code inside a markdown code block (e.g. \`\`\`javascript ... \`\`\`). Do not include explanations outside the code block.

File: ${targetFile}
Original Code:
\`\`\`
${originalCode}
\`\`\`
`;
  }

  static buildADRPrompt(findingContext) {
    return `You are a Principal Software Architect. Given the following engineering/architecture finding, draft an Architecture Decision Record (ADR) that addresses this issue.

Context:
Title: ${findingContext.title}
Category: ${findingContext.category}
Severity: ${findingContext.severity}
Description: ${findingContext.description}
File/Evidence: ${findingContext.file || findingContext.evidence || 'N/A'}

Produce a structured JSON response matching this exact schema:
{
  "title": "A short, concise title for the ADR",
  "status": "Proposed",
  "context": "Background and description of the current situation and the finding.",
  "decision": "The proposed change or decision to resolve the issue.",
  "consequences": "Positive and negative consequences of this decision.",
  "alternatives": "Other options that were considered and why they were rejected.",
  "evidence": "References to the specific finding, file, or architectural rule."
}`;
  }
}
