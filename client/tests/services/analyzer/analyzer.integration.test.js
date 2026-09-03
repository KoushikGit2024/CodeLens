import 'fake-indexeddb/auto';
import { executeAnalysisPipeline } from '@/services/analyzer/analyzer.worker.js';
import { saveFile, remove } from '@/services/analyzer/repository/persistence.store.js';

describe('analyzer pipeline integration', () => {
  const repoId = 'integration-test-repo';

  afterEach(async () => {
    await remove(repoId);
  });

  test('successfully executes full pipeline on mock files', async () => {
    // 1. Setup mock files in IDB
    await saveFile(repoId, 'index.js', 'export const x = 1;');
    await saveFile(repoId, 'app.ts', 'import { x } from "./index"; console.log(x);');

    // 2. Track messages posted back to main thread
    const messages = [];
    const postMessage = (msg) => messages.push(msg);

    // 3. Execute pipeline
    const analysis = await executeAnalysisPipeline(repoId, {}, postMessage);

    // 4. Verify AST Analysis
    expect(analysis.status).toBe('ready');
    expect(analysis.totalFiles).toBe(2);
    expect(analysis.analyzedFiles).toBe(2);
    expect(analysis.files).toHaveLength(2);

    // 5. Verify Graph Engine Output
    expect(analysis.graph).toBeDefined();
    expect(analysis.graph.nodes).toBeDefined();
    expect(analysis.graph.edges).toBeDefined();
    
    // Check nodes exist for both files
    expect(analysis.graph.nodes.some(n => n.id === 'file:index.js')).toBe(true);
    expect(analysis.graph.nodes.some(n => n.id === 'file:app.ts')).toBe(true);
    
    // Check edge exists from app.ts -> index.js
    const toIndex = analysis.graph.edges.find(e => e.source === 'file:app.ts' && e.target === 'file:index.js');
    expect(toIndex).toBeDefined();

    // 6. Verify Progress Messages
    expect(messages.some(m => m.phase === 'scanning_files')).toBe(true);
    expect(messages.some(m => m.phase === 'building_graph')).toBe(true);
  });
});
