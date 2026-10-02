import { pipeline, env } from '@xenova/transformers';

// Tell transformers.js not to load local models but from HF
env.allowLocalModels = false;

class SemanticPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(model = 'Xenova/all-MiniLM-L6-v2', useCache = true, progress_callback = null) {
    if (this.instance === null || this.model !== model) {
      this.model = model;
      env.useBrowserCache = useCache;
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async event => {
  const { type, repoId, files, query, analysis } = event.data;

  try {
    if (type === 'init') {
      await SemanticPipeline.getInstance(event.data.model, event.data.useBrowserCache, progress => {
        self.postMessage({ type: 'progress', payload: progress });
      });
      self.postMessage({ type: 'init_done' });
    } else if (type === 'index_repo') {
      const extractor = await SemanticPipeline.getInstance();

      const total = files.length;
      const embeddings = [];

      for (let i = 0; i < total; i++) {
        const file = files[i];
        // Skip binary files or non-string contents
        if (typeof file.content !== 'string') {
          if (i === total - 1) {
            self.postMessage({ type: 'index_progress', current: i + 1, total });
          }
          continue;
        }

        // If we have AST analysis for this file, use Smart Chunking
        const fileAnalysis = analysis ? analysis[file.filePath] : null;
        const symbols = fileAnalysis?.symbols || [];

        const chunksToEmbed = [];
        const indexableTypes = ['Function', 'Method', 'Class', 'Component'];

        const semanticSymbols = symbols.filter(sym => indexableTypes.includes(sym.type));

        if (semanticSymbols.length > 0) {
          // Embed each relevant symbol individually
          for (const sym of semanticSymbols) {
            // Reconstruct the symbol text from source if possible, or just embed metadata
            // Since we have startLine and endLine, we can extract the exact source lines
            const lines = file.content.split('\\n');
            const startIdx = Math.max(0, sym.startLine - 1);
            const endIdx = Math.min(lines.length, sym.endLine);
            const symbolCode = lines.slice(startIdx, endIdx).join('\\n');

            // Limit each symbol chunk to 2000 chars to avoid OOM, but it's much better scoped
            chunksToEmbed.push({
              text: `File: ${file.filePath}\\nSymbol: ${sym.name} (${sym.type})\\n\\n${symbolCode.substring(0, 2000)}`,
              symbolName: sym.name,
              startLine: sym.startLine,
            });
          }
        } else {
          // Fallback to top-level file chunking for simple files
          chunksToEmbed.push({
            text: `File: ${file.filePath}\\n\\n${file.content.substring(0, 1500)}`,
            symbolName: null,
            startLine: 1,
          });
        }

        const fileChunks = [];
        for (const chunk of chunksToEmbed) {
          const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
          fileChunks.push({
            symbolName: chunk.symbolName,
            startLine: chunk.startLine,
            embedding: Array.from(output.data),
          });
        }

        embeddings.push({
          repoId,
          filePath: file.filePath,
          chunks: fileChunks,
        });

        // Report progress every 5 files or on last file
        if (i % 5 === 0 || i === total - 1) {
          self.postMessage({ type: 'index_progress', current: i + 1, total });
        }
      }

      self.postMessage({ type: 'index_done', embeddings });
    } else if (type === 'search') {
      const extractor = await SemanticPipeline.getInstance();
      const output = await extractor(query, { pooling: 'mean', normalize: true });
      self.postMessage({ type: 'search_done', embedding: Array.from(output.data) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
});
