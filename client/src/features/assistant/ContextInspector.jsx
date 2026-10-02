import React, { useState } from 'react';
import { Layers, FileCode, Check, X, ChevronDown, ChevronRight, Info } from 'lucide-react';

/**
 * ContextInspector
 * Displays the bundled context (Facts, Files) to the user before sending to AI.
 * Allows removing specific files to save tokens.
 */
export default function ContextInspector({ contextData, onConfirm, onCancel }) {
  const [expanded, setExpanded] = useState(true);
  const [excludedFiles, setExcludedFiles] = useState(new Set());

  if (!contextData) return null;

  const handleToggleFile = filePath => {
    setExcludedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    // Filter out excluded files
    const modifiedContext = {
      ...contextData,
      files: (contextData.files || []).filter(f => !excludedFiles.has(f.filePath)),
    };
    onConfirm(modifiedContext);
  };

  return (
    <div className="bg-gray-800/80 backdrop-blur-md border border-indigo-500/30 rounded-xl p-4 mb-4 shadow-xl text-sm animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          {expanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
          <Layers size={18} className="text-indigo-400" />
          <h3 className="font-semibold text-gray-200">AI Context Payload Inspector</h3>
          <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full ml-2">
            {(contextData.files?.length || 0) - excludedFiles.size} Files included
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md transition-colors"
            title="Cancel request"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4">
          {/* Facts Section */}
          {contextData.facts && contextData.facts.length > 0 && (
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2 text-gray-300">
                <Info size={14} className="text-blue-400" />
                <span className="font-medium">Repository Facts & Topology</span>
              </div>
              <ul className="list-disc list-inside text-gray-400 space-y-1 ml-1 text-xs">
                {contextData.facts.map((fact, i) => (
                  <li key={i} className="truncate" title={fact}>
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source Files Section */}
          {contextData.files && contextData.files.length > 0 ? (
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2 text-gray-300">
                <FileCode size={14} className="text-green-400" />
                <span className="font-medium">Source Files ({contextData.files.length})</span>
                <span className="text-xs text-gray-500 ml-auto">Uncheck to exclude from prompt</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {contextData.files.map((f, i) => {
                  const isExcluded = excludedFiles.has(f.filePath);
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-2 rounded border ${isExcluded ? 'bg-gray-800/40 border-gray-700/30' : 'bg-gray-800 border-gray-700'} hover:border-gray-600 transition-colors`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => handleToggleFile(f.filePath)}
                          className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900 bg-gray-700"
                        />
                        <span
                          className={`truncate text-xs ${isExcluded ? 'text-gray-500 line-through' : 'text-gray-300'}`}
                        >
                          {f.filePath}
                        </span>
                      </div>
                      <span className={`text-[10px] ${isExcluded ? 'text-gray-600' : 'text-gray-500'}`}>
                        {f.content ? `${Math.round(f.content.length / 1024)}KB` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic px-2">No source files attached to this context.</div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20"
            >
              <Check size={16} />
              Confirm & Send to AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
