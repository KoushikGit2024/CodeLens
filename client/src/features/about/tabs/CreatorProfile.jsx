import React, { useState } from 'react';
import {
  User,
  Github,
  Linkedin,
  Briefcase,
  Mail,
  ExternalLink,
  Code2,
  Cpu,
  Rocket,
  Database,
  Sparkles,
  Network,
  Send,
} from 'lucide-react';

export default function CreatorProfile() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleEmailSubmit = e => {
    e.preventDefault();
    const mailtoUrl = `mailto:koushik.kar@example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in zoom-in duration-500 max-w-5xl mx-auto">
      {/* Header section */}
      <div className="flex flex-col items-center text-center space-y-4 mb-8">
        <h1 className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-light tracking-tight text-text">
          <User className="w-10 h-10 md:w-14 md:h-14 text-accent" strokeWidth={1.5} />
          <span>
            About the <span className="font-semibold text-accent">Creator</span>
          </span>
        </h1>
        <p className="text-xl text-muted mt-6 leading-relaxed max-w-3xl">
          Hi, I'm Koushik. I built CodeLens to solve the chaotic, undocumented reality of enterprise software
          architecture.
        </p>
      </div>

      {/* Side-by-Side Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        {/* Left Column: Bio & Philosophy */}
        <div className="md:col-span-5 flex flex-col gap-6">
          {/* Profile Card */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col">
            <div className="relative z-10 flex flex-col items-center text-center">
              <h2 className="text-2xl font-bold text-text mb-2">Koushik Kar</h2>
              <p className="text-accent font-medium mb-6">Full-Stack Software Engineer</p>
              <p className="text-muted text-sm leading-relaxed mb-8">
                Passionate about developer tools, artificial intelligence, and building intuitive UIs that make complex
                data digestible.
              </p>

              <div className="flex gap-4 w-full">
                <a
                  href="https://github.com/KoushikGit2024"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-surface border border-border rounded-xl text-text hover:bg-panel transition-colors"
                >
                  <Github className="w-5 h-5 text-accent" />
                </a>
                <a
                  href="https://www.linkedin.com/in/koushik-kar-409489329"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-surface border border-border rounded-xl text-text hover:bg-panel transition-colors"
                >
                  <Linkedin className="w-5 h-5 text-accent" />
                </a>
                <a
                  href="http://instagram.com/chidanand013"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-surface border border-border rounded-xl text-text hover:bg-panel transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-accent"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Core Philosophy */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col">
            <div className="relative z-10">
              <h3 className="text-lg font-medium text-text mb-4 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-accent" /> The Philosophy
              </h3>
              <p className="text-muted text-sm leading-relaxed mb-4">
                I believe that understanding code shouldn't require reading every line. Tools should parse the
                deterministic structure of a repository, while AI should be leveraged to explain the intent behind it.
              </p>
              <p className="text-muted text-sm leading-relaxed">
                CodeLens is the physical manifestation of that idea: a client-dominant analysis engine paired with a
                stateless AI proxy.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: The Story */}
        <div className="md:col-span-7 flex flex-col gap-6">
          {/* The Story */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col h-full">
            <div className="relative z-10 mb-2">
              <h3 className="text-2xl font-medium text-text mb-6 flex items-center gap-3">
                <Briefcase className="w-6 h-6 text-accent" /> Why I Built This
              </h3>
              <div className="space-y-6 text-muted leading-relaxed">
                <p>
                  As developers, we spend vastly more time reading code than writing it. When joining a new team or
                  diving into a monolithic legacy repository, the onboarding experience is often a chaotic mess of
                  scattered documentation and spaghetti dependencies.
                </p>
                <p>
                  I wanted to build an interactive map for codebases. A tool where you could zoom out to see the
                  overarching architectural boundaries, but also zoom in to inspect the cyclomatic complexity of a
                  specific conditional block.
                </p>
                <p>
                  By marrying Web Workers (for heavy AST parsing in the browser) with modern LLMs (for summarization and
                  refactoring plans), CodeLens bridges the gap between static analysis and artificial intelligence.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Row: Contact Form */}
      <div className="w-full mt-2">
        <div className="group relative overflow-hidden rounded-3xl border border-border bg-panel p-8 hover:border-accent/50 transition-colors flex flex-col">
          <div className="relative z-10 flex flex-col md:flex-row gap-8">
            <div className="md:w-1/3 flex flex-col justify-center">
              <h3 className="text-2xl font-medium text-text mb-4 flex items-center gap-3">
                <Mail className="w-8 h-8 text-accent" /> Get in Touch
              </h3>
              <p className="text-muted leading-relaxed">
                Have feedback, questions, or just want to chat about engineering tools? Send me a message directly. I'd
                love to hear from you.
              </p>
            </div>
            <form onSubmit={handleEmailSubmit} className="md:w-2/3 flex flex-col gap-4">
              <input
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                required
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors"
              />
              <textarea
                placeholder="Your message..."
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors resize-none custom-scrollbar"
              />
              <button
                type="submit"
                className="w-full md:w-auto md:ml-auto px-8 py-3 rounded-xl bg-surface border border-border text-text font-medium flex items-center justify-center gap-2 hover:bg-panel transition-colors"
              >
                <Send className="w-4 h-4 text-accent" /> Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
