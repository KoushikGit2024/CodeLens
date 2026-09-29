import { pipeline, env } from '@xenova/transformers';

// Tell transformers.js not to load local models but from HF
env.allowLocalModels = false;
env.useBrowserCache = true;

class SemanticPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { type, repoId, files, query } = event.data;

  try {
    if (type === 'init') {
      await SemanticPipeline.getInstance((progress) => {
        self.postMessage({ type: 'progress', payload: progress });
      });
      self.postMessage({ type: 'init_done' });
    } 
    
    else if (type === 'index_repo') {
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

        // Truncate file content to first 1000 characters to avoid huge vectors/OOM
        const textToEmbed = `File: ${file.filePath}\n\n${file.content.substring(0, 1000)}`;
        
        // Generate embedding
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        
        embeddings.push({
          repoId,
          filePath: file.filePath,
          embedding: Array.from(output.data)
        });

        // Report progress every 5 files or on last file
        if (i % 5 === 0 || i === total - 1) {
          self.postMessage({ type: 'index_progress', current: i + 1, total });
        }
      }

      self.postMessage({ type: 'index_done', embeddings });
    }

    else if (type === 'search') {
      const extractor = await SemanticPipeline.getInstance();
      const output = await extractor(query, { pooling: 'mean', normalize: true });
      self.postMessage({ type: 'search_done', embedding: Array.from(output.data) });
    }

  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
});
