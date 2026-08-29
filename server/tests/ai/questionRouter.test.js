const { routeQuestion, INTENTS } = require('../../src/ai/questionRouter');

describe('Question Router', () => {
  const mockAnalysis = {
    files: [
      { filePath: 'src/auth/authService.js' },
      { filePath: 'src/index.js' }
    ]
  };

  it('routes metrics deterministically', () => {
    const route = routeQuestion('How many files are in this project?', mockAnalysis);
    expect(route.intent).toBe(INTENTS.METRICS);
    expect(route.requiresAi).toBe(false);
  });

  it('routes dependency questions deterministically if file is known', () => {
    const route = routeQuestion('What depends on authService.js?', mockAnalysis);
    expect(route.intent).toBe(INTENTS.DEPENDENCY);
    expect(route.targetFile).toBe('src/auth/authService.js');
    expect(route.requiresAi).toBe(false);
  });

  it('routes architecture questions to AI', () => {
    const route = routeQuestion('Explain the architecture of the project', mockAnalysis);
    expect(route.intent).toBe(INTENTS.ARCHITECTURE);
    expect(route.requiresAi).toBe(true);
  });

  it('routes file explanation to AI', () => {
    const route = routeQuestion('What does authService.js do?', mockAnalysis);
    expect(route.intent).toBe(INTENTS.FILE_EXPLANATION);
    expect(route.targetFile).toBe('src/auth/authService.js');
    expect(route.requiresAi).toBe(true);
  });

  it('routes unknown questions to general', () => {
    const route = routeQuestion('Hello world', mockAnalysis);
    expect(route.intent).toBe(INTENTS.GENERAL);
    expect(route.requiresAi).toBe(true);
  });
});
