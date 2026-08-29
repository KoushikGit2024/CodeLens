import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { repositoryApi } from '../api';

export default function ImpactPage() {
  const { id } = useParams();
  const [impact, setImpact] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [impactRes, statusRes] = await Promise.all([
          repositoryApi.getChangeImpact(id),
          repositoryApi.get(id)
        ]);
        setImpact(impactRes.data);
        setStatus(statusRes.data);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) return <div className="p-8 text-white">Loading impact analysis...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-surface text-slate-300 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex justify-between items-end border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Change Impact Analysis</h1>
            <p className="text-slate-400 mt-1">Repository: {status?.name}</p>
          </div>
        </header>

        {impact?.changedFiles?.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400 border border-slate-700">
            No files were changed in the latest analysis version.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Changed Files */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Changed Files</h2>
              </div>
              <ul className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {impact?.changedFiles?.map(f => (
                  <li key={f} className="text-sm font-mono text-yellow-300 bg-yellow-400/10 px-2 py-1 rounded">
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Affected Components */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Affected Architecture Components</h2>
              </div>
              <ul className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {impact?.affectedComponents?.length === 0 ? (
                  <li className="text-sm text-slate-500 italic">No specific architectural components affected.</li>
                ) : impact?.affectedComponents?.map(c => (
                  <li key={c} className="text-sm font-medium text-purple-300 bg-purple-400/10 px-2 py-1 rounded">
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            {/* Direct Dependents */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex justify-between">
                  <span>Directly Affected Files</span>
                  <span className="text-sm text-slate-400 font-normal bg-slate-700 px-2 py-0.5 rounded-full">
                    {impact?.directlyAffectedFiles?.length}
                  </span>
                </h2>
              </div>
              <ul className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {impact?.directlyAffectedFiles?.length === 0 ? (
                  <li className="text-sm text-slate-500 italic">No files directly depend on the changes.</li>
                ) : impact?.directlyAffectedFiles?.map(f => (
                  <li key={f} className="text-sm font-mono text-orange-300 bg-orange-400/10 px-2 py-1 rounded truncate" title={f}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Transitive Dependents */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex justify-between">
                  <span>Transitively Affected Files</span>
                  <span className="text-sm text-slate-400 font-normal bg-slate-700 px-2 py-0.5 rounded-full">
                    {impact?.transitivelyAffectedFiles?.length}
                  </span>
                </h2>
              </div>
              <ul className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {impact?.transitivelyAffectedFiles?.length === 0 ? (
                  <li className="text-sm text-slate-500 italic">No downstream files affected.</li>
                ) : impact?.transitivelyAffectedFiles?.map(f => (
                  <li key={f} className="text-sm font-mono text-red-300 bg-red-400/10 px-2 py-1 rounded truncate" title={f}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
