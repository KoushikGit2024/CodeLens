const { generateOverviewDocs, generateModuleDocs } = require('../../src/ai/documentationGenerator');
const aiProvider = require('../../src/ai/aiProvider');

jest.mock('../../src/ai/aiProvider');

describe('Documentation Generator', () => {
  const mockAnalysis = {
    name: 'test-repo',
    files: [
      { filePath: 'src/index.js', symbols: [] }
    ]
  };

  const mockGraph = {
    nodes: [],
    edges: [],
    meta: { unresolvedImports: 0 }
  };

  const mockArchitecture = {
    components: [],
    entryPoints: [],
    apiBoundaries: []
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('falls back to deterministic facts when provider is not configured', async () => {
    aiProvider.isProviderConfigured.mockReturnValue(false);

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    expect(docs.facts.projectName).toBe('test-repo');
    expect(docs.aiInterpretation).toBeNull();
  });

  it('parses structured JSON from AI and maps to aiInterpretation', async () => {
    aiProvider.isProviderConfigured.mockReturnValue(true);
    
    // Simulate Watsonx returning markdown wrapped JSON
    const aiResponse = `\`\`\`json\n{
      "summary": "A test repo",
      "technologies": ["React"],
      "architectureSummary": "MVC",
      "observations": ["Good"]
    }\n\`\`\``;
    aiProvider.generateAnswer.mockResolvedValue(aiResponse);

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    expect(docs.aiInterpretation.summary).toBe('A test repo');
    expect(docs.aiInterpretation.technologies).toContain('React');
  });

  it('handles malformed AI JSON gracefully', async () => {
    aiProvider.isProviderConfigured.mockReturnValue(true);
    
    const aiResponse = `This is just a raw string, not JSON.`;
    aiProvider.generateAnswer.mockResolvedValue(aiResponse);

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    // It should fallback to putting the string in summary
    expect(docs.aiInterpretation.summary).toBe('This is just a raw string, not JSON.');
    expect(docs.aiInterpretation.technologies).toEqual([]);
  });
});
