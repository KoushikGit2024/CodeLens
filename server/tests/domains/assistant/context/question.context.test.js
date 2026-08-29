const { buildQuestionContext } = require('../../../../src/domains/assistant/context/question.context');
const { INTENTS } = require('../../../../src/domains/assistant/question.router');

describe('Question Context Builder', () => {
  const mockAnalysis = {
    name: 'test-repo',
    files: [
      { filePath: 'src/auth.js', symbols: [] },
      { filePath: 'src/app.js', symbols: [{ kind: 'import', source: './auth' }] }
    ]
  };

  it('builds metrics context correctly', () => {
    const { routing, contextData } = buildQuestionContext(mockAnalysis, 'how many files', '/tmp');
    expect(routing.intent).toBe(INTENTS.METRICS);
    expect(contextData.facts).toContain('The repository contains 2 files.');
  });

  it('builds dependency context correctly', () => {
    const { routing, contextData } = buildQuestionContext(mockAnalysis, 'what depends on src/auth.js', '/tmp');
    expect(routing.intent).toBe(INTENTS.DEPENDENCY);
    expect(contextData.facts.some(f => f.includes('src/auth.js is imported by: src/app.js'))).toBe(true);
  });
});
