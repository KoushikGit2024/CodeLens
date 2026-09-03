import React, { useState } from 'react';
import { FileText, Cpu, AlertTriangle, Link as LinkIcon, Box, Layers, Play, Loader2, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import AiResponse from '../../shared/components/ai/AiResponse';

export default function ModuleDocumentation({ docs, repoId, onGenerateAi, isGeneratingAi }) {
  const [copied, setCopied] = useState(false);

  if (!docs) return <div className="text-muted text-sm flex items-center justify-center h-full">Loading documentation...</div>;

  const handleCopyAi = () => {
    if (!ai) return;
    let textToCopy = '';
    const summary = typeof ai.responsibility === 'string' ? ai.responsibility : JSON.stringify(ai.responsibility, null, 2);
    const explanation = typeof ai.architectureRole === 'string' ? ai.architectureRole : JSON.stringify(ai.architectureRole, null, 2);
    
    if (summary) textToCopy += summary;
    if (explanation) textToCopy += `\n\n${explanation}`;
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (docs.unsupported) {
    return (
      <div className="space-y-4 animate-fade-in max-w-3xl mx-auto mt-8">
        <div className="flex items-center gap-2 p-4 bg-warning/10 border border-warning/20 rounded-lg text-warning text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p><strong>{docs.reason || "This file type is not parsed for architectural insights."}</strong><br/>Switch to the 'Source Code' tab to view its raw contents.</p>
        </div>
      </div>
    );
  }

  const { facts, aiInterpretation: ai } = docs;

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto w-full pb-12">
      <header className="border-b border-border pb-6 pt-2">
        <h1 className="text-2xl font-mono text-white mb-4 break-all flex items-center gap-3">
          <FileText className="w-6 h-6 text-accent shrink-0" />
          {facts.filePath}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs bg-surface border border-border rounded-full px-3 py-1 flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-muted" />
            Component: <span className="text-white font-medium">{facts.component}</span>
          </span>
          <span className="text-xs bg-surface border border-border rounded-full px-3 py-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-muted" />
            Layer: <span className="text-white font-medium">{facts.layer}</span>
          </span>
          {facts.isApiBoundary && (
            <span className="text-xs bg-success/10 border border-success/30 text-success rounded-full px-3 py-1 font-medium">
              API Boundary
            </span>
          )}
        </div>
      </header>

      {/* Dependencies Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-lg p-5">
           <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
             <LinkIcon className="w-4 h-4 text-accent" />
             Outgoing Dependencies
           </h3>
           {facts.dependencies?.length > 0 ? (
             <ul className="space-y-2 max-h-48 overflow-auto custom-scrollbar pr-2">
               {facts.dependencies.map((dep, i) => (
                 <li key={i} className="text-xs text-muted break-all bg-[#0d1117] p-2 rounded border border-border/50">{dep}</li>
               ))}
             </ul>
           ) : <p className="text-xs text-muted italic">No internal dependencies.</p>}
        </div>
        <div className="bg-surface border border-border rounded-lg p-5">
           <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
             <LinkIcon className="w-4 h-4 text-accent" />
             Incoming Dependents
           </h3>
           {facts.dependents?.length > 0 ? (
             <ul className="space-y-2 max-h-48 overflow-auto custom-scrollbar pr-2">
               {facts.dependents.map((dep, i) => (
                 <li key={i} className="text-xs text-muted break-all bg-[#0d1117] p-2 rounded border border-border/50">{dep}</li>
               ))}
             </ul>
           ) : <p className="text-xs text-muted italic">No dependents.</p>}
        </div>
      </section>

      {/* AI Module Interpretation */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium flex items-center gap-2 text-white">
            <Cpu className="w-5 h-5 text-accent" />
            Architectural Role
          </h2>
          {ai && (
            <button 
              onClick={handleCopyAi}
              className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors cursor-pointer"
              title="Copy Architectural Role"
            >
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        
        {ai ? (
          <div className="bg-panel border border-border rounded-xl shadow-lg p-6">
            <AiResponse 
              repoId={repoId}
              chatId={`docs-module-${repoId}-${(facts.filePath || '').replace(/[^a-zA-Z0-9]/g, '-')}`}
              data={{
                summary: ai.responsibility,
                explanation: ai.architectureRole,
                facts: (ai.apiNotes && facts.isApiBoundary) ? [`**API Notes:**\n${ai.apiNotes}`] : [],
                inferences: ai.inferredDependenciesPurpose ? [`**Dependency Context:**\n${ai.inferredDependenciesPurpose}`] : []
              }}
              title={null} 
            />
          </div>
        ) : (
          <div className="bg-surface p-6 rounded-lg border border-border flex flex-col items-center justify-center gap-3 text-center">
            <Cpu className="w-8 h-8 text-muted" />
            <div>
              <h3 className="text-white font-medium mb-1">AI Architectural Summary</h3>
              <p className="text-sm text-muted mb-4 max-w-md">Generate a human-readable summary of this file's role in the architecture, backed by Watsonx.</p>
            </div>
            <button
              onClick={onGenerateAi}
              disabled={isGeneratingAi}
              className="flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent rounded font-medium transition-colors disabled:opacity-50"
            >
              {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isGeneratingAi ? 'Generating...' : 'Generate Summary'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
