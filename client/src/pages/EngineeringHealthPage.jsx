import React, { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, AlertCircle, RefreshCw, ShieldAlert, CheckCircle, LayoutDashboard } from 'lucide-react';
import AIStatusIndicator from '../components/AIStatusIndicator';
import { useParams, useNavigate } from 'react-router-dom';
import { getEngineeringRisks, getEngineeringInsights } from '../api';

const EngineeringHealthPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const riskData = await getEngineeringRisks(id);
      setModel(riskData);
      
      // Fetch insights in parallel but don't block the main UI on it
      setLoadingInsights(true);
      getEngineeringInsights(id)
        .then(setInsights)
        .catch(err => {
          console.error("Failed to load insights", err);
          // Fails silently, deterministic UI still works
        })
        .finally(() => setLoadingInsights(false));

    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  const getSeverityBadge = (severity) => {
    const map = {
      critical: 'bg-red-500/20 text-red-500 border border-red-500/30',
      high: 'bg-orange-500/20 text-orange-500 border border-orange-500/30',
      warning: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
    };
    return `px-2 py-0.5 rounded text-xs uppercase font-medium ${map[severity] || ''}`;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-gray-400">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500"></div>
          <p>Analyzing structural engineering health...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          <h2 className="mb-2 font-semibold">Error Loading Engineering Health</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-900 p-8 text-gray-200">
      
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Engineering Health</h1>
          <p className="mt-2 text-gray-400">{model.summary}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Health Score</div>
          <div className={`text-5xl font-bold ${getScoreColor(model.score)}`}>
            {model.score}
            <span className="text-2xl text-gray-500">/100</span>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="rounded border border-gray-700 bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Total Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.totalRisks}</div>
        </div>
        <div className="rounded border border-gray-700 bg-gray-800 p-4">
          <div className="text-sm text-red-400">Critical Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.critical}</div>
        </div>
        <div className="rounded border border-gray-700 bg-gray-800 p-4">
          <div className="text-sm text-orange-400">High Risks</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.high}</div>
        </div>
        <div className="rounded border border-gray-700 bg-gray-800 p-4">
          <div className="text-sm text-yellow-400">Warnings</div>
          <div className="mt-1 text-2xl font-semibold">{model.metrics.warning}</div>
        </div>
      </div>

      {insights && (
        <div className="mb-8 rounded-lg border border-blue-500/30 bg-blue-500/10 p-6">
          <h2 className="mb-4 flex items-center text-lg font-semibold text-blue-400">
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Architecture Insights
          </h2>
          <p className="mb-4 text-gray-300">{insights.summary}</p>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-400 uppercase tracking-wider">Priority Actions</h3>
              <ul className="list-inside list-disc space-y-1 text-gray-300">
                {insights.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-400 uppercase tracking-wider">Observations</h3>
              <ul className="list-inside list-disc space-y-1 text-gray-300">
                {insights.observations.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 italic">
            Limitations: {insights.limitations}
          </div>
        </div>
      )}

      {loadingInsights && !insights && (
        <div className="mb-8 flex items-center gap-3 text-blue-400 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
          Generating AI interpretations...
        </div>
      )}

      <h2 className="mb-4 text-xl font-semibold text-white border-b border-gray-700 pb-2">Identified Risks</h2>
      
      {model.risks.length === 0 ? (
        <div className="rounded border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
          No engineering risks identified. The codebase appears structurally healthy.
        </div>
      ) : (
        <div className="space-y-4">
          {model.risks.map((risk) => (
            <div key={risk.id} className="rounded border border-gray-700 bg-gray-800 p-5 shadow-sm transition-colors hover:border-gray-600">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className={getSeverityBadge(risk.severity)}>{risk.severity}</span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">{risk.category}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-medium text-white">{risk.title}</h3>
                </div>
                <button 
                  onClick={() => navigate(`/explore/${id}/refactoring`)}
                  className="text-sm font-medium text-[#cba6f7] hover:text-[#cba6f7]/80 flex items-center"
                >
                  View Refactoring Strategy
                  <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </div>
              <p className="mb-3 text-gray-300">{risk.description}</p>
              {risk.file && (
                <div className="text-sm text-gray-500 font-mono bg-gray-900 px-3 py-1.5 rounded inline-block">
                  {risk.file}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EngineeringHealthPage;
