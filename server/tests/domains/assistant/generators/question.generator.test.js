const { generateQuestionAnswer } = require('../../../../src/domains/assistant/generators/question.generator');
const aiProvider = require('../../../../src/core/ai/ai.service');

jest.mock('../../../../src/core/ai/ai.service');

describe('Question Generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('bypasses AI for deterministic queries', async () => {
    const routing = { requiresAi: false, targetFile: 'a.js' };
    const contextData = { facts: ['Fact A'] };
    
    const ans = await generateQuestionAnswer('test', routing, contextData);
    
    expect(ans.summary).toContain('deterministic');
    expect(ans.facts).toContain('Fact A');
    expect(ans.generatedBy).toContain('Deterministic Engine');
    expect(aiProvider.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('calls AI and parses JSON successfully', async () => {
    aiProvider.isAIAvailable.mockReturnValue(true);
    aiProvider.generateStructuredResponse.mockResolvedValue({
      summary: "It's React.",
      explanation: null,
      facts: [],
      inferences: [],
      references: [],
      limitations: []
    });

    const routing = { requiresAi: true };
    const contextData = { facts: [], files: [] };
    
    const ans = await generateQuestionAnswer('test', routing, contextData);
    
    expect(ans.summary).toBe("It's React.");
    expect(ans.generatedBy).toContain('AI CodeLens Engine');
  });
});
