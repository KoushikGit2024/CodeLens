import React from 'react';
import { Bot, MessageSquare, Shield, StopCircle, Paperclip, FileText, Database } from 'lucide-react';
import { clsx } from 'clsx';

export default function AIAssistantShowcase() {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <Bot className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            Repository <span className="font-semibold text-accent">Assistant</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed">
          Your intelligent pair programmer. Ask questions, attach code files, and get deep contextual insights about
          your repository powered by advanced AI.
        </p>
      </div>

      {/* Bento Grid Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Row 1: Contextual Chat & Attachments (Col Span 7) */}
        <div className="md:col-span-7 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-medium text-text">Context-Aware Chat</h3>
            </div>
            <p className="text-muted leading-relaxed mb-6 text-lg">
              The AI chat is designed to understand your codebase. You can easily drag and drop files directly into the
              chat input to provide explicit context.
            </p>
            <p className="text-muted leading-relaxed">
              When you attach files, the AI reads their exact contents before generating a response, ensuring that its
              answers are grounded in your actual code, rather than generic programming advice.
            </p>
          </div>

          {/* Mock UI Element: Chat Input with Attachments */}
          <div className="relative z-10 mt-auto border border-border rounded-xl bg-surface p-4 flex flex-col gap-3">
            <div className="flex gap-2 mb-2">
              {/* Mock Attachment Chip */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-border rounded-lg text-xs text-text">
                <FileText className="w-3 h-3 text-accent" />
                <span>auth.js</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-border rounded-lg text-xs text-text">
                <Database className="w-3 h-3 text-accent" />
                <span>schema.prisma</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-panel border border-border rounded-lg px-4 py-3 text-sm text-muted flex items-center">
                Explain how the auth logic connects to the schema...
              </div>
              <button className="p-3 bg-panel border border-border text-text rounded-lg hover:border-accent transition-colors">
                <Paperclip className="w-5 h-5 text-accent" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 1: Generation Controls (Col Span 5) */}
        <div className="md:col-span-5 group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col justify-between">
          <div className="relative z-10 h-full flex flex-col">
            <StopCircle className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-2xl font-medium text-text mb-4">Generation Controls</h3>
            <p className="text-muted leading-relaxed mb-6">
              AI responses stream in real-time, allowing you to read the answer as it's being generated.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              If the AI starts going down the wrong path, you don't have to wait. The <strong>"Stop Generation"</strong>{' '}
              button allows you to instantly halt the stream, saving time and tokens so you can adjust your prompt.
            </p>

            <div className="mt-auto flex justify-center">
              <button className="px-6 py-3 rounded-full bg-surface border border-border text-text font-medium flex items-center gap-2 hover:border-accent transition-all">
                <StopCircle className="w-5 h-5 text-accent" /> Stop Generation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
