const { generateOverviewDocs, generateModuleDocs } = require('../../../../src/domains/assistant/generators/documentation.generator');
const aiProvider = require('../../../../src/core/ai/ai.service');

jest.mock('../../../../src/core/ai/ai.service');

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
    aiProvider.isAIAvailable.mockReturnValue(false);

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    expect(docs.facts.projectName).toBe('test-repo');
    expect(docs.aiInterpretation).toBeNull();
  });

  it('parses structured JSON from AI and maps to aiInterpretation', async () => {
    aiProvider.isAIAvailable.mockReturnValue(true);
    
    const aiResponse = {
      summary: "A test repo",
      technologies: ["React"],
      architectureSummary: "MVC",
      observations: ["Good"]
    };
    aiProvider.generateStructuredResponse.mockResolvedValue(aiResponse);

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    expect(docs.aiInterpretation.summary).toBe('A test repo');
    expect(docs.aiInterpretation.technologies).toContain('React');
  });

  it('handles AI generation failure gracefully', async () => {
    aiProvider.isAIAvailable.mockReturnValue(true);
    aiProvider.generateStructuredResponse.mockRejectedValue(new Error('AI Failed'));

    const docs = await generateOverviewDocs(mockAnalysis, mockGraph, mockArchitecture);
    expect(docs.aiInterpretation).toBeNull();
  });
});
