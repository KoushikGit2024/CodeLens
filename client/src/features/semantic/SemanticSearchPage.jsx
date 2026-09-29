import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Brain, Search, Database, Loader2, Sparkles, FileCode2, Info } from 'lucide-react';
import { initializeSemanticEngine, indexRepository, search } from '../../services/semantic/semantic.service.js';
import { loadAllEmbeddings } from '../../services/analyzer/repository/persistence.store.js';
import { useToast } from '../../shared/context/ToastContext';

export default function SemanticSearchPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  
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
      setInitStatus('Downloading ML Model (approx 25MB)...');
      
      await initializeSemanticEngine((progress) => {
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

      await indexRepository(repoId, (prog) => {
        setIndexProgress({ current: prog.current, total: prog.total });
      });

      setIsIndexing(false);
      setIsInitialized(true);
    } catch (error) {
      console.error(error);
      addToast({
        title: 'Initialization Failed',
        description: error.message || 'An unexpected error occurred during semantic indexing.',
        type: 'error'
      });
      setInitStatus('');
      setIsInitializing(false);
      setIsIndexing(false);
    }
  };

  const handleSearch = async (e) => {
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
        type: 'error'
      });
    } finally {
      setIsSearching(false);
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 max-w-2xl mx-auto text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-center mb-6">
          <Brain className="w-10 h-10 text-accent" />
        </div>
        
        <h2 className="text-3xl font-light tracking-tight text-text mb-4 flex items-center gap-3">
          Semantic Search <span className="text-xs font-semibold px-2 py-0.5 bg-accent/20 text-accent rounded-full border border-accent/30 uppercase tracking-wider">Pro</span>
        </h2>
        
        <p className="text-muted text-lg leading-relaxed mb-8">
          Upgrade your search from exact keywords to natural language. Find where "user authentication happens" or "database connections are pooled" using a local machine learning model.
        </p>

        <div className="bg-surface border border-text/10 shadow rounded-lg p-6 text-left mb-8 w-full">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-text">
            <Info className="w-4 h-4 text-accent" /> Before you activate:
          </h4>
          <ul className="text-sm text-muted space-y-2">
            <li className="flex items-center gap-2">• <Database className="w-4 h-4" /> Downloads a 25MB embedding model to your browser.</li>
            <li className="flex items-center gap-2">• <Brain className="w-4 h-4" /> Processing large repositories will heavily use your CPU temporarily.</li>
            <li className="flex items-center gap-2">• <Sparkles className="w-4 h-4" /> 100% Private: All inference happens locally. No data leaves your machine.</li>
          </ul>
        </div>

        {isInitializing || isIndexing ? (
          <div className="w-full flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
            <p className="text-text font-medium">{initStatus}</p>
            {isIndexing && indexProgress.total > 0 && (
              <div className="w-full mt-4">
                <div className="flex justify-between text-xs text-muted mb-2">
                  <span>Embedding Files</span>
                  <span>{indexProgress.current} / {indexProgress.total}</span>
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
    );
  }

  return (
    <div className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-accent/10 rounded-lg">
          <Brain className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Semantic Search <span className="text-[10px] font-bold px-1.5 py-0.5 bg-accent/20 text-accent rounded flex items-center uppercase tracking-wider">Pro</span>
          </h2>
          <p className="text-xs text-muted">Ask what the code does, not just what it says.</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="relative mb-8 group">
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "Where is the payment gateway logic?"...'
          className="w-full bg-panel border-2 border-border rounded-lg pl-14 pr-32 py-5 text-lg shadow-sm focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all text-text placeholder:text-muted/50"
        />
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-muted group-focus-within:text-accent transition-colors" />
        <button 
          type="submit"
          disabled={isSearching || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-surface hover:bg-accent hover:text-black border border-border hover:border-accent rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:hover:bg-surface disabled:hover:text-text disabled:hover:border-border"
        >
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-6">
        {results.length > 0 ? (
          results.map((res, i) => (
            <div 
              key={i} 
              onClick={() => navigate(`/explore/${repoId}/source?path=${encodeURIComponent(res.filePath)}`)}
              className="bg-panel border border-border rounded-lg p-4 flex items-center justify-between hover:border-accent/50 hover:bg-surface transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-4 truncate">
                <FileCode2 className="w-5 h-5 text-muted group-hover:text-accent transition-colors shrink-0" />
                <span className="font-medium text-sm truncate group-hover:text-text transition-colors">
                  {res.filePath}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-accent">
                    {(res.score * 100).toFixed(1)}% Match
                  </span>
                  <div className="w-20 h-1.5 bg-surface rounded-full mt-1 overflow-hidden">
                    <div 
                      className="h-full bg-accent" 
                      style={{ width: `${Math.max(0, res.score * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          !isSearching && query && (
            <div className="text-center text-muted py-12">
              No strong semantic matches found.
            </div>
          )
        )}
      </div>
    </div>
  );
}
