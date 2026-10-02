import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Brain, Network, Search, Database, Loader2, Sparkles, FileCode2, Info, Cpu } from 'lucide-react';
import { initializeSemanticEngine, indexRepository, search } from '../../services/semantic/semantic.service.js';
import { loadAllEmbeddings, removeEmbeddings } from '../../services/analyzer/repository/persistence.store.js';
import { useToast } from '../../shared/context/ToastContext';

const MODEL_DETAILS = {
  'Xenova/all-MiniLM-L6-v2': {
    size: '~22MB',
    arch: 'MiniLM',
    features: 'Extremely fast execution with minimal memory footprint.',
    bestFor: 'General purpose embedding on low-end devices.',
  },
  'Xenova/paraphrase-albert-small-v2': {
    size: '~46MB',
    arch: 'ALBERT',
    features: 'Highly compressed via parameter sharing. Excellent memory efficiency.',
    bestFor: 'Paraphrase identification and semantic similarity.',
  },
  'Supabase/gte-small': {
    size: '~67MB',
    arch: 'BERT',
    features: 'Outstanding retrieval performance for its size.',
    bestFor: 'Balanced performance, outperforming many larger models.',
  },
  'Xenova/paraphrase-MiniLM-L3-v2': {
    size: '~69MB',
    arch: 'MiniLM-L3',
    features: 'Heavily compressed (L3) architecture for maximum speed.',
    bestFor: 'Extremely fast paraphrase and similarity matching.',
  },
  'Xenova/multi-qa-MiniLM-L6-cos-v1': {
    size: '~91MB',
    arch: 'MiniLM',
    features: 'Trained specifically on conversational and Q&A datasets.',
    bestFor: 'Matching natural language queries to specific code snippets.',
  },
  'Xenova/bge-small-en-v1.5': {
    size: '~133MB',
    arch: 'BERT',
    features: 'Top-tier performance on the MTEB leaderboard for small models.',
    bestFor: 'High accuracy retrieval tasks.',
  },
  'Xenova/nomic-embed-text-v1.5': {
    size: '~550MB',
    arch: 'Nomic BERT',
    features: 'Massive 8192-token context window. Requires high system RAM.',
    bestFor: 'Deep semantic understanding and large document chunking.',
  },
};

export default function SemanticSearchPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');

  const [selectedModel, setSelectedModel] = useState('Xenova/all-MiniLM-L6-v2');
  const [useBrowserCache, setUseBrowserCache] = useState(true);

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });

  const [query, setQuery] = useState(() => {
    return sessionStorage.getItem(`semantic_query_${repoId}`) || '';
  });
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(() => {
    const saved = sessionStorage.getItem(`semantic_results_${repoId}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Check if embeddings exist for this repo
  useEffect(() => {
    const checkStatus = async () => {
      const existing = await loadAllEmbeddings(repoId);
      if (existing && existing.length > 0) {
        setIsInitialized(true);
      }
    };
    checkStatus();
  }, [repoId]);

  const handleInitialize = async () => {
    try {
      setIsInitializing(true);
      setInitStatus('Downloading ML Model...');

      await initializeSemanticEngine(selectedModel, useBrowserCache, progress => {
        if (progress.status === 'initiate') {
          setInitStatus(`Initiating download: ${progress.file}`);
        } else if (progress.status === 'progress') {
          setInitStatus(`Downloading: ${progress.file} (${Math.round(progress.progress || 0)}%)`);
        } else if (progress.status === 'done') {
          setInitStatus(`Loaded: ${progress.file}`);
        } else if (progress.status === 'ready') {
          setInitStatus('Model ready. Preparing to index...');
        }
      });

      setIsInitializing(false);
      setIsIndexing(true);
      setInitStatus('Extracting semantics from files...');

      await indexRepository(repoId, prog => {
        setIndexProgress({ current: prog.current, total: prog.total });
      });

      setIsIndexing(false);
      setIsInitialized(true);
    } catch (error) {
      console.error(error);
      addToast({
        title: 'Initialization Failed',
        description: error.message || 'An unexpected error occurred during semantic indexing.',
        type: 'error',
      });
      setInitStatus('');
      setIsInitializing(false);
      setIsIndexing(false);
    }
  };

  const handleSearch = async e => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const topResults = await search(repoId, query);
      setResults(topResults);
      sessionStorage.setItem(`semantic_query_${repoId}`, query);
      sessionStorage.setItem(`semantic_results_${repoId}`, JSON.stringify(topResults));
    } catch (error) {
      console.error(error);
      addToast({
        title: 'Search Failed',
        description: error.message || 'An error occurred while searching.',
        type: 'error',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearCache = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete the downloaded models and embeddings? This frees up storage but requires re-downloading next time.'
      )
    ) {
      try {
        await removeEmbeddings(repoId);
        await caches.delete('transformers-cache');
        setIsInitialized(false);
        setResults([]);
        sessionStorage.removeItem(`semantic_query_${repoId}`);
        sessionStorage.removeItem(`semantic_results_${repoId}`);
        addToast({
          title: 'Cache Cleared',
          description: 'Models and embeddings successfully removed.',
          type: 'success',
        });
      } catch (error) {
        addToast({ title: 'Error', description: 'Failed to clear cache.', type: 'error' });
      }
    }
  };

  if (!isInitialized) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar">
        <div className="flex flex-col items-center justify-center min-h-full p-4 sm:p-6 max-w-4xl mx-auto animate-in fade-in zoom-in duration-500">
          <div className="flex flex-col sm:flex-row items-start gap-5 mb-6 bg-surface/30 p-5 rounded-xl border border-border/50">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center shadow-inner shadow-accent/5">
              <Network className="w-7 h-7 sm:w-8 sm:h-8 text-accent" />
            </div>
            <div className="text-left">
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-text mb-2 flex items-center gap-3">
                Semantic Search{' '}
                <span className="text-[10px] font-bold px-2 py-0.5 bg-accent/20 text-accent rounded border border-accent/30 uppercase tracking-wider">
                  Pro
                </span>
              </h2>
              <p className="text-muted text-sm sm:text-base leading-relaxed">
                Upgrade your search from exact keywords to natural language. Find where "user authentication happens" or
                "database connections are pooled" using a highly-optimized local AI model.
              </p>
            </div>
          </div>

          <div className="bg-surface border border-border shadow-lg rounded-xl p-5 sm:p-6 text-left mb-6 w-full grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-4 text-text">
                <Info className="w-4 h-4 text-accent" /> Before you activate:
              </h4>
              <ul className="text-sm text-muted space-y-4">
                <li className="flex items-start gap-3">
                  <Database className="w-4 h-4 mt-0.5 shrink-0 text-accent/70" />{' '}
                  <span>Downloads a local embedding model directly to your browser cache.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Cpu className="w-4 h-4 mt-0.5 shrink-0 text-accent/70" />{' '}
                  <span>The initial indexing process is CPU-intensive. Your browser may slow down momentarily.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-accent/70" />{' '}
                  <span>100% Private: All inference happens locally. No source code ever leaves your machine.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-text mb-1.5 block">Select Embedding Model</label>
                <div className="relative group">
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full appearance-none bg-panel border-2 border-border hover:border-accent/50 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all text-text font-medium cursor-pointer shadow-sm"
                  >
                    <option value="Xenova/all-MiniLM-L6-v2">all-MiniLM-L6-v2 (Ultra Light, ~22MB)</option>
                    <option value="Xenova/paraphrase-albert-small-v2">
                      paraphrase-albert-small-v2 (Super Light, ~46MB)
                    </option>
                    <option value="Supabase/gte-small">gte-small (Balanced, ~67MB)</option>
                    <option value="Xenova/paraphrase-MiniLM-L3-v2">
                      paraphrase-MiniLM-L3-v2 (Light & Fast, ~69MB)
                    </option>
                    <option value="Xenova/multi-qa-MiniLM-L6-cos-v1">multi-qa-MiniLM-L6 (Q&A Optimized, ~91MB)</option>
                    <option value="Xenova/bge-small-en-v1.5">bge-small-en-v1.5 (High Accuracy, ~133MB)</option>
                    <option value="Xenova/nomic-embed-text-v1.5">nomic-embed-text-v1.5 (Deep Context, ~550MB)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted group-hover:text-accent transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>
                </div>

                {MODEL_DETAILS[selectedModel] && (
                  <div className="mt-2.5 p-2.5 bg-panel border border-border rounded text-[13px] grid grid-cols-2 gap-y-1.5 gap-x-3">
                    <div>
                      <span className="font-medium text-muted">Size:</span>{' '}
                      <span className="text-text">{MODEL_DETAILS[selectedModel].size}</span>
                    </div>
                    <div>
                      <span className="font-medium text-muted">Arch:</span>{' '}
                      <span className="text-text">{MODEL_DETAILS[selectedModel].arch}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-muted">Features:</span>{' '}
                      <span className="text-text">{MODEL_DETAILS[selectedModel].features}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-muted">Best For:</span>{' '}
                      <span className="text-accent">{MODEL_DETAILS[selectedModel].bestFor}</span>
                    </div>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mt-2 transition-colors hover:bg-yellow-500/15">
                <input
                  type="checkbox"
                  checked={useBrowserCache}
                  onChange={e => setUseBrowserCache(e.target.checked)}
                  className="w-4 h-4 rounded border-yellow-500/50 bg-yellow-900/40 text-yellow-500 focus:ring-yellow-500/40 focus:ring-offset-0 cursor-pointer transition-colors"
                />
                <span className="text-[13px] text-yellow-600 font-medium">
                  Cache model in browser storage for future use
                </span>
              </label>
            </div>
          </div>

          {isInitializing || isIndexing ? (
            <div className="w-full flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
              <p className="text-text font-medium">{initStatus}</p>
              {isIndexing && indexProgress.total > 0 && (
                <div className="w-full mt-4">
                  <div className="flex justify-between text-xs text-muted mb-2">
                    <span>Embedding Files</span>
                    <span>
                      {indexProgress.current} / {indexProgress.total}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${(indexProgress.current / indexProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleInitialize}
              className="px-8 py-3 bg-accent text-black font-semibold rounded-lg hover:bg-accent/90 transition-all flex items-center gap-2 shadow shadow-accent/20"
            >
              <Brain className="w-5 h-5" /> Initialize Semantic Engine
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col p-4 sm:p-6 max-w-4xl mx-auto w-full animate-in fade-in duration-500 min-h-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg shrink-0">
              <Network className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Semantic Search{' '}
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-accent/20 text-accent rounded flex items-center uppercase tracking-wider">
                  Pro
                </span>
              </h2>
              <p className="text-xs text-muted">Ask what the code does, not just what it says.</p>
            </div>
          </div>
          <button
            onClick={handleClearCache}
            className="w-full sm:w-auto sm:ml-auto px-4 py-2 text-xs border border-red-500/50 text-red-500 rounded hover:bg-red-500/10 transition-colors shrink-0"
          >
            Clear Cache & Models
          </button>
        </div>

        <form onSubmit={handleSearch} className="relative mb-8 group">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='Try "Where is the payment gateway logic?"...'
            className="w-full bg-panel border-2 border-border rounded-lg pl-10 sm:pl-14 pr-24 sm:pr-32 py-4 sm:py-5 text-base sm:text-lg shadow-sm focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all text-text placeholder:text-muted/50"
          />
          <Search className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 text-muted group-focus-within:text-accent transition-colors" />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 px-4 sm:px-6 py-1.5 sm:py-2.5 bg-surface hover:bg-accent hover:text-black border border-border hover:border-accent rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-50 disabled:hover:bg-surface disabled:hover:text-text disabled:hover:border-border"
          >
            {isSearching ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : 'Search'}
          </button>
        </form>

        <div className="flex flex-col gap-3 pb-6">
          {results.length > 0
            ? results.map((res, i) => (
                <div
                  key={i}
                  onClick={() => navigate(`/explore/${repoId}/source?path=${encodeURIComponent(res.filePath)}`)}
                  className="bg-panel border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-accent/50 hover:bg-surface transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileCode2 className="w-5 h-5 text-muted group-hover:text-accent transition-colors shrink-0" />
                    <span className="font-medium text-sm truncate group-hover:text-text transition-colors">
                      {res.filePath}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 sm:ml-4">
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-0">
                      <span className="text-xs font-medium text-accent">{(res.score * 100).toFixed(1)}% Match</span>
                      <div className="w-20 h-1.5 bg-surface rounded-full sm:mt-1 overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${Math.max(0, res.score * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            : !isSearching &&
              query && <div className="text-center text-muted py-12">No strong semantic matches found.</div>}
        </div>
      </div>
    </div>
  );
}
