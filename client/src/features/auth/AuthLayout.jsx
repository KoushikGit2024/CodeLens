import { Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../../shared/components/Logo';
import { Brain, Activity, FileCode, ArrowLeft, Home } from 'lucide-react';
import InteractiveFeatureCard from '../../shared/components/InteractiveFeatureCard';
import SpotlightPanel from '../../shared/components/SpotlightPanel';

export default function AuthLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full bg-surface overflow-hidden">
      {/* Left side: Feature List */}
      <SpotlightPanel className="hidden lg:flex w-1/2 bg-panel border-r border-border p-12 flex-col justify-between">
        {/* Subtle grid background */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
          style={{
            backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
            backgroundSize: '32px 32px'
          }}
        />
        <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-lg mx-auto">
          <Logo className="w-12 h-12 text-accent mb-8 animate-in fade-in zoom-in-95 duration-700" style={{ animationFillMode: 'both' }} />
          <h2 className="text-3xl font-bold text-text mb-4 tracking-tight text-center animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            Welcome to CodeLens
          </h2>
          <p className="text-lg text-text/70 text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
            Sign in or create an account to gain deep architectural insights, track engineering health, and empower your workflow with AI.
          </p>
          
          <div className="space-y-4 w-full relative">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
              <InteractiveFeatureCard 
                title="AI Code Intelligence"
                description="Interact with AI to explain complex architecture and debug issues."
                icon={Brain}
                colorClass="text-accent group-hover:bg-accent/20 bg-accent/10 border-accent/20"
              />
            </div>
            
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
              <InteractiveFeatureCard 
                title="Engineering Health"
                description="Track cyclomatic complexity, dead code, and cross-file clones automatically."
                icon={Activity}
                colorClass="text-indigo-400 group-hover:bg-indigo-500/20 bg-indigo-500/10 border-indigo-500/20"
              />
            </div>
            
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '500ms', animationFillMode: 'both' }}>
              <InteractiveFeatureCard 
                title="Automated Analysis"
                description="Process zip uploads instantly in your browser with zero server storage."
                icon={FileCode}
                colorClass="text-blue-400 group-hover:bg-blue-500/20 bg-blue-500/10 border-blue-500/20"
              />
            </div>
          </div>
        </div>
      </SpotlightPanel>

      {/* Right side: Form Outlet */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Navigation buttons */}
        <div className="sticky top-0 left-0 w-full p-4 z-10 flex items-center justify-between pointer-events-none">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors group pointer-events-auto"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors group pointer-events-auto"
          >
            <Home className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            Home
          </button>
        </div>

        <div className="min-h-[calc(100%-56px)] flex items-center justify-center p-6 sm:p-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
