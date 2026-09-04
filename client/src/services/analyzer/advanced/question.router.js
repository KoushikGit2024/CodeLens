

/**
 * questionRouter.js
 *
 * Implements a heuristic intent classifier to determine what kind of context
 * a question requires, and whether it can be answered deterministically
 * without calling the AI provider.
 */

const INTENTS = {
  METRICS: 'METRICS',
  DEPENDENCY: 'DEPENDENCY',
  ARCHITECTURE: 'ARCHITECTURE',
  REFACTORING: 'REFACTORING',
  REPOSITORY_OVERVIEW: 'REPOSITORY_OVERVIEW',
  FILE_EXPLANATION: 'FILE_EXPLANATION',
  GENERAL: 'GENERAL',
};

/**
 * Categorize a question based on simple regex heuristics.
 *
 * @param {string} question
 * @returns {object} { intent, requiresAi, targetFile }
 */
function routeQuestion(question, analysis, activeContext = null) {
  const q = question.toLowerCase();

  const result = {
    intent: INTENTS.GENERAL,
    requiresAi: true,
    targetFile: activeContext?.filePath || null,
  };

  // Check if a specific file is mentioned in the prompt (only if we don't have an active context)
  if (!result.targetFile && analysis) {
    const fileMatch = analysis.files.find(f => {
      const basename = f.filePath.split('/').pop().toLowerCase();
      return q.includes(f.filePath.toLowerCase()) || q.includes(basename);
    });
    if (fileMatch) {
      result.targetFile = fileMatch.filePath;
    }
  }

  // 1. Repository Overview
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

  // 2. Metrics / Counts (Deterministic)
  if (
    q.match(/how many (files|modules|components|packages)/) ||
    q.match(/count of (files|modules)/)
  ) {
    result.intent = INTENTS.METRICS;
    result.requiresAi = false;
    return result;
  }

  // 2. Dependencies (Can be deterministic if asking "what depends on X" or "what does X import")
  if (
    q.match(/what depends on /) ||
    q.match(/which files depend on /) ||
    q.match(/what does .* depend on/) ||
    q.match(/what does .* import/)
  ) {
    result.intent = INTENTS.DEPENDENCY;
    if (result.targetFile) {
      // If we know the file, we can answer this deterministically
      result.requiresAi = false;
    }
    return result;
  }

  // 3. Architecture
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
    // We let AI explain architecture, though we could make entry points deterministic
    if (q.match(/what are the entry points/)) {
      result.requiresAi = false;
    }
    return result;
  }

  // 4. Refactoring
  if (
    q.match(/refactor/) ||
    q.match(/technical debt/) ||
    q.match(/fix first/) ||
    q.match(/safest refactoring/)
  ) {
    result.intent = INTENTS.REFACTORING;
    return result;
  }

  // 5. File Explanation
  if (
    q.match(/what does .* do/) ||
    q.match(/explain /) ||
    q.match(/how does .* work/)
  ) {
    result.intent = result.targetFile ? INTENTS.FILE_EXPLANATION : INTENTS.GENERAL;
    return result;
  }

  return result;
}

export { 
  INTENTS,
  routeQuestion,
 };
