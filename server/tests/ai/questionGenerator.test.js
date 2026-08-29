const { generateQuestionAnswer } = require('../../src/ai/questionGenerator');
const aiProvider = require('../../src/ai/aiProvider');

jest.mock('../../src/ai/aiProvider');

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
    expect(aiProvider.generateAnswer).not.toHaveBeenCalled();
  });

  it('calls AI and parses JSON successfully', async () => {
    aiProvider.isProviderConfigured.mockReturnValue(true);
    aiProvider.generateAnswer.mockResolvedValue(`\`\`\`json
{
  "summary": "AI summary",
  "explanation": "AI explanation",
  "facts": ["A"],
  "inferences": ["B"],
  "references": []
}
\`\`\``);

    const routing = { requiresAi: true };
    const contextData = { facts: [], files: [] };
    
    const ans = await generateQuestionAnswer('test', routing, contextData);
    
    expect(ans.summary).toBe('AI summary');
    expect(ans.inferences).toContain('B');
    expect(ans.generatedBy).toContain('IBM watsonx');
  });
});
