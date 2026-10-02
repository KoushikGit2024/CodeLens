/**
 * question.router.js
 *
 * It intercepts the raw user question, then extracts keyword heuristics,
 * and then it applies an intent classification mapping to route the request efficiently.
 */

export const INTENTS = {
  METRICS: 'METRICS',
  DEPENDENCY: 'DEPENDENCY',
  ARCHITECTURE: 'ARCHITECTURE',
  REFACTORING: 'REFACTORING',
  REPOSITORY_OVERVIEW: 'REPOSITORY_OVERVIEW',
  FILE_EXPLANATION: 'FILE_EXPLANATION',
  GENERAL: 'GENERAL',
};

/**
 * It evaluates the question string against regex rules, then extracts the closest logical intent,
 * and then it applies deterministic flags to skip the AI provider when possible.
 */
export function routeQuestion(question, analysis, activeContext = null) {
  const q = question.toLowerCase();

  const result = {
    intent: INTENTS.GENERAL,
    requiresAi: true,
    targetFile: activeContext?.filePath || null,
  };

  // It scans the analysis files array, then extracts a matching file path from the query, and then it applies it to the targetFile property.
  if (!result.targetFile && analysis?.files) {
    const fileMatch = analysis.files.find(f => {
      const basename = f.filePath.split('/').pop().toLowerCase();
      return q.includes(f.filePath.toLowerCase()) || q.includes(basename);
    });
    if (fileMatch) {
      result.targetFile = fileMatch.filePath;
    }
  }

  if (
    q.match(/overview of this repository/) ||
    q.match(/how is this project structured/) ||
    q.match(/most important parts/) ||
    q.match(/what should i understand first/) ||
    q.match(/where should i start/) ||
    q.match(/most important files/)
  ) {
    result.intent = INTENTS.REPOSITORY_OVERVIEW;
    return result;
  }

  if (q.match(/how many (files|modules|components|packages)/) || q.match(/count of (files|modules)/)) {
    result.intent = INTENTS.METRICS;
    result.requiresAi = false;
    return result;
  }

  if (
    q.match(/what depends on /) ||
    q.match(/which files depend on /) ||
    q.match(/what does .* depend on/) ||
    q.match(/what does .* import/)
  ) {
    result.intent = INTENTS.DEPENDENCY;
    if (result.targetFile) {
      result.requiresAi = false;
    }
    return result;
  }

  if (
    q.match(/architecture/) ||
    q.match(/layer/) ||
    q.match(/component/) ||
    q.match(/structure/) ||
    q.match(/entry points/) ||
    q.match(/circular dependencies/) ||
    q.match(/biggest risks/) ||
    q.match(/coupled files/)
  ) {
    result.intent = INTENTS.ARCHITECTURE;
    if (q.match(/what are the entry points/)) {
      result.requiresAi = false;
    }
    return result;
  }

  if (q.match(/refactor/) || q.match(/technical debt/) || q.match(/fix first/) || q.match(/safest refactoring/)) {
    result.intent = INTENTS.REFACTORING;
    return result;
  }

  if (q.match(/what does .* do/) || q.match(/explain /) || q.match(/how does .* work/)) {
    result.intent = result.targetFile ? INTENTS.FILE_EXPLANATION : INTENTS.GENERAL;
    return result;
  }

  return result;
}
