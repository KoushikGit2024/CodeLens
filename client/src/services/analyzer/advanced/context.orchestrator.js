/**
 * context.orchestrator.js
 *
 * Orchestrates AI Context by standardizing how CodeLens talks to the LLM.
 * This decoupled layer extracts prompt engineering from the API bridge, paving the way
 * for AST-scoped context, graph neighbor injection, and structured outputs.
 */

export class ContextOrchestrator {
  static buildArchitecturePrompt(model) {
    const compLabels = (model.components || []).map(c => c.data?.label || c.id || c.name || 'Component').join(', ');
    const entryPoints = (model.entryPoints || []).join(', ') || 'None detected';
    const violationsCount = model.violations?.length || 0;
    const relationsCount = model.relations?.length || 0;

    return `You are a Principal Software Architect analyzing a software repository.
Analyze the following architectural model metrics:

Components: ${compLabels || 'None detected'}
Total Relations: ${relationsCount}
Boundary Violations: ${violationsCount}
Entry Points: ${entryPoints}

Provide an actionable architectural evaluation assessing modularity, component coupling, architectural boundaries, and structural risks.
Produce a structured JSON response matching this schema:
{
  "summary": "2-3 comprehensive paragraphs providing an executive evaluation of the system modularity, coupling, and boundary integrity.",
  "inferences": [
    "Key architectural inference or pattern observed (e.g. Layered/Hexagonal, strong domain isolation, etc.)"
  ],
  "risks": [
    "Specific architectural risk or boundary violation concern"
  ],
  "recommendations": [
    "Concrete, prioritized action to improve modularity or resolve boundary violations"
  ]
}`;
  }

  static buildIntelligencePrompt(intelligence) {
    const langs = Object.entries(intelligence.repository.languages || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([l, n]) => `${l} (${n} files)`)
      .join(', ');

    const hotspotList = (intelligence.hotspots || [])
      .slice(0, 5)
      .map(h => `  - ${h.filePath} (hotspot score: ${h.score})`)
      .join('\n');

    const topCandidates = (intelligence.refactoring.topCandidates || [])
      .map(c => `  - ${c.title} [${c.priority}]`)
      .join('\n');

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
    const criticalList = (risks.risks || [])
      .filter(r => r.severity === 'critical')
      .slice(0, 10)
      .map(
        r => `- [${r.category || 'RISK'}] ${r.title} in ${r.file || 'Repository'}: ${r.description || r.message || ''}`
      );

    const highList = (risks.risks || [])
      .filter(r => r.severity === 'high')
      .slice(0, 10)
      .map(
        r => `- [${r.category || 'RISK'}] ${r.title} in ${r.file || 'Repository'}: ${r.description || r.message || ''}`
      );

    const hotspots = (risks.hotspots || []).slice(0, 8).map(h => {
      const fp = typeof h === 'string' ? h : h.file;
      const q = typeof h === 'object' && h.quadrant ? ` (${h.quadrant})` : '';
      const s = typeof h === 'object' && h.score ? ` [Score: ${h.score}]` : '';
      return `- ${fp}${q}${s}`;
    });

    // Category breakdown
    const categoryCounts = {};
    (risks.risks || []).forEach(r => {
      const cat = r.category || 'OTHER';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryCounts)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(', ');

    return `You are a Principal Software Architect and Technical Director conducting an in-depth Engineering Health Review.

## Repository Engineering Health Metrics
- Overall Health Score: ${risks.score} / 100 (${risks.riskLevel || 'unhealthy'} tier)
- Critical Risks: ${risks.risks?.filter(r => r.severity === 'critical').length || 0}
- High Severity Risks: ${risks.risks?.filter(r => r.severity === 'high').length || 0}
- Warning Risks: ${risks.risks?.filter(r => r.severity === 'warning').length || 0}
- Issues by Category: ${categoryBreakdown || 'N/A'}

## Key Behavioral Hotspots (High Churn + High Complexity)
${hotspots.length > 0 ? hotspots.join('\n') : 'No behavioral hotspots identified.'}

## Critical Findings
${criticalList.length > 0 ? criticalList.join('\n') : 'No critical findings identified.'}

## High Severity Findings
${highList.length > 0 ? highList.join('\n') : 'No high severity findings identified.'}

Perform an exhaustive, multi-faceted architectural evaluation. Provide concrete analysis referencing the specific files, hotspot modules, and categories identified above.

Produce a JSON response matching the following schema:
{
  "summary": "3-4 detailed paragraphs analyzing the state of the codebase. Discuss why the overall score is what it is, the systemic drivers of fragility (e.g. coupling vs complexity vs churn), and the business/engineering consequences of inaction.",
  "recommendations": [
    "Immediate Priority 1: Concrete remediation action for the critical risks and named files (e.g. decoupling circular dependencies or decomposing god files).",
    "Priority 2: Tactical refactoring recommendation targeting the behavioral hotspots.",
    "Priority 3: Quality and test strategy to mitigate regression risks.",
    "Priority 4: Architectural governance or pattern recommendation to prevent re-accumulation of technical debt."
  ],
  "observations": [
    "Architectural Observation 1: In-depth analysis of coupling and structural dependencies across the detected components.",
    "Architectural Observation 2: Analysis of code duplication, cognitive complexity spikes, or dead code patterns.",
    "Architectural Observation 3: Assessment of churn velocity and behavioral instability in the hotspot modules."
  ],
  "limitations": "Technical debt constraints, team capacity considerations, and sequencing trade-offs (e.g. why a big-bang rewrite must be avoided in favor of incremental modular refactorings).",
  "references": ["Array of the top affected file paths mentioned above"]
}`;
  }

  static buildSingleRiskPrompt(risk) {
    return `You are a Principal Software Architect analyzing an engineering risk or architectural finding.
Finding Details:
Title: ${risk.title}
Category: ${risk.category || 'General'}
Severity: ${risk.severity || 'Medium'}
File: ${risk.file || 'N/A'}
Description: ${risk.description || risk.message || 'N/A'}
Evidence: ${risk.evidence || risk.details || 'N/A'}

Analyze this finding in depth. Explain why this issue occurs, its architectural impact, and concrete recommendations to remediate it.
Produce a structured JSON response matching this schema:
{
  "summary": "1-2 paragraphs explaining the root cause and architectural impact of this finding.",
  "recommendations": [
    "Step 1 or concrete mitigation recommendation",
    "Step 2 or architectural pattern to apply"
  ],
  "observations": [
    "Observation regarding coupling, complexity, or maintainability",
    "Secondary risk or technical debt observation"
  ],
  "limitations": "Trade-offs or considerations when fixing this issue."
}`;
  }

  static buildRefactoringStrategyPrompt(candidate) {
    let blueprintText = '';
    if (candidate.decompositionBlueprint?.clusters?.length > 1) {
      blueprintText = `
Architectural Decomposition Blueprint (LCOM4 = ${candidate.decompositionBlueprint.lcom4}, Cohesion: ${candidate.decompositionBlueprint.cohesionRating}):
Proposed Split Files:
${candidate.decompositionBlueprint.clusters.map(c => `  - ${c.targetFileName} (${c.role}): symbols [${c.symbols.join(', ')}] -> ${c.rationale}`).join('\n')}
Migration Steps:
${candidate.decompositionBlueprint.migrationSteps.map((s, idx) => `  ${idx + 1}. ${s}`).join('\n')}
`;
    }

    return `You are an expert software architect. Analyze the following refactoring candidate and provide a detailed strategy.
Title: ${candidate.title}
Summary: ${candidate.summary}
Affected Files: ${candidate.files?.join(', ')}
Severity: ${candidate.severity}
${blueprintText}
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

  static buildAutoFixPrompt(
    candidate,
    targetFile,
    originalCode,
    impactConstraints,
    specificEvidenceText,
    strategiesText,
    snippetContext = ''
  ) {
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
