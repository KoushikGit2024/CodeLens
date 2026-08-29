import React, { useState, useEffect } from 'react';
import { 
  X, ChevronRight, ChevronLeft, LayoutDashboard, 
  FileCode2, GitMerge, Box, ShieldAlert, Wrench, BookOpen, Bot 
} from 'lucide-react';

const TOUR_STEPS = [
  {
    title: 'Welcome to CodeLens',
    icon: <LayoutDashboard className="w-6 h-6 text-accent" />,
    desc: 'CodeLens analyzes your repository and turns its structure into something you can explore.'
  },
  {
    title: 'Repository Intelligence',
    icon: <LayoutDashboard className="w-6 h-6 text-accent" />,
    desc: 'Your starting point for understanding the entire repository.'
  },
  {
    title: 'Architecture',
    icon: <Box className="w-6 h-6 text-warning" />,
    desc: 'Understand how the major parts of your system fit together.'
  },
  {
    title: 'Source Explorer',
    icon: <FileCode2 className="w-6 h-6 text-success" />,
    desc: 'Jump from insights directly into the actual source code.'
  },
  {
    title: 'Dependency Graph',
    icon: <GitMerge className="w-6 h-6 text-[#cba6f7]" />,
    desc: 'See which files depend on each other and identify circular or unresolved dependencies.'
  },
  {
    title: 'Engineering Health',
    icon: <ShieldAlert className="w-6 h-6 text-danger" />,
    desc: 'Identify structural risks such as oversized modules, excessive coupling, dependency cycles and architecture violations.'
  },
  {
    title: 'Refactoring',
    icon: <Wrench className="w-6 h-6 text-blue-400" />,
    desc: 'Find the highest-priority technical debt and understand the potential blast radius before changing code.'
  },
  {
    title: 'Documentation',
    icon: <BookOpen className="w-6 h-6 text-[#a6e3a1]" />,
    desc: 'Browse automatically generated repository and module documentation grounded in deterministic structural facts.'
  },
  {
    title: 'Repository Assistant',
    icon: <Bot className="w-6 h-6 text-accent" />,
    desc: 'Ask natural-language questions about the repository. AI is optional; deterministic questions continue to work offline.'
  },
  {
    title: 'You\'re ready.',
    icon: <Bot className="w-6 h-6 text-success" />,
    desc: 'Start exploring your repository.'
  }
];

export default function WelcomeTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const isCompleted = localStorage.getItem('codelens_tour_completed');
    if (!isCompleted) {
      // Small delay so the user sees the dashboard first
      const t = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('codelens_tour_completed', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const current = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-panel border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-surface">
          <h2 className="text-sm font-semibold text-white">Welcome to CodeLens</h2>
          <button onClick={dismiss} className="text-muted hover:text-white transition-colors" title="Skip Tour">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center gap-4 min-h-[220px] justify-center">
          <div className="p-4 bg-surface rounded-full border border-border">
            {current.icon}
          </div>
          <h3 className="text-lg font-medium text-white">{current.title}</h3>
          <p className="text-sm text-muted leading-relaxed max-w-sm">
            {current.desc}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-between items-center bg-surface">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div 
                key={i} 
                className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-border'}`} 
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-3 py-1.5 rounded text-sm font-medium border border-border hover:bg-panel transition-colors"
              >
                Back
              </button>
            )}
            {step < TOUR_STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-3 py-1.5 rounded text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={dismiss}
                className="px-4 py-1.5 rounded text-sm font-medium bg-success text-white hover:bg-success/90 transition-colors"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
