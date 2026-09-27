/**
 * AnalysisProgress.jsx
 *
 * It maps the active worker phase, then extracts visual indicator logic, 
 * and then it applies the animated UI steps to show offline parsing progress.
 */
import React from 'react';
import { Loader2, CheckCircle, Circle } from 'lucide-react';

const PHASES = [
  { id: 'uploading', label: 'Uploading repository' },
  { id: 'extracting', label: 'Extracting files' },
  { id: 'scanning_files', label: 'Detecting languages' },
  { id: 'analyzing_ast', label: 'Parsing source files' },
  { id: 'building_graph', label: 'Building dependency graph' },
  { id: 'building_architecture', label: 'Building architecture model' },
  { id: 'ready', label: 'Finalizing repository intelligence' }
];

export default function AnalysisProgress({ currentPhase, phaseDetails }) {
  /**
   * It inspects the current phase ID, then extracts its array index position, 
   * and then it applies conditional rendering for completed, active, and pending steps.
   */
  const currentIndex = PHASES.findIndex(p => p.id === currentPhase);
  
  return (
    <div className="flex flex-col gap-3 max-w-sm w-full mx-auto p-5 bg-panel border border-border rounded-lg shadow-sm">
      <h3 className="text-sm font-medium text-text mb-2">Analyzing Repository</h3>
      
      {PHASES.map((phase, index) => {
        const isCompleted = currentIndex > index || currentPhase === 'ready';
        const isCurrent = currentPhase === phase.id;
        const isPending = currentIndex < index && currentPhase !== 'ready';

        return (
          <div key={phase.id} className={`flex items-center gap-3 ${isPending ? 'opacity-50' : ''}`}>
            {isCompleted ? (
              <CheckCircle className="w-4 h-4 text-success" />
            ) : isCurrent ? (
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
            ) : (
              <Circle className="w-4 h-4 text-muted" />
            )}
            <div className="flex flex-col">
              <span className={`text-xs font-medium ${isCurrent ? 'text-text' : 'text-muted'}`}>
                {phase.label}
              </span>
              {isCurrent && phase.id === 'analyzing_ast' && phaseDetails?.total > 0 && (
                <span className="text-[10px] text-muted">
                  {phaseDetails.current} / {phaseDetails.total} files
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}