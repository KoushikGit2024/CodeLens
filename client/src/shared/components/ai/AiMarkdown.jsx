import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function AiMarkdown({ content, className = '' }) {
  if (!content) return null;

  let safeContent = content;
  
  // Attempt to parse stringified JSON leaks from the LLM
  if (typeof safeContent === 'string' && safeContent.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(safeContent);
      if (parsed && typeof parsed === 'object') safeContent = parsed;
    } catch(e) {}
  }

  // If it's an object, gracefully extract human-readable text instead of dumping raw JSON
  if (typeof safeContent === 'object' && safeContent !== null) {
    const parts = [];
    if (safeContent.summary) parts.push(safeContent.summary);
    if (safeContent.explanation) parts.push(safeContent.explanation);
    if (safeContent.responsibility) parts.push(safeContent.responsibility);
    if (safeContent.architectureRole) parts.push(safeContent.architectureRole);
    if (safeContent.text) parts.push(safeContent.text);
    
    if (parts.length > 0) {
      safeContent = parts.join('\n\n');
    } else {
      safeContent = '```json\n' + JSON.stringify(safeContent, null, 2) + '\n```';
    }
  }

  return (
    <div className={`ai-markdown prose prose-invert prose-sm max-w-none prose-pre:p-0 prose-pre:bg-transparent ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return <CodeBlock match={match} props={props}>{children}</CodeBlock>;
            }
            return (
              <code className="bg-panel/50 text-accent font-mono text-[0.85em] px-1.5 py-0.5 rounded" {...props}>
                {children}
              </code>
            );
          },
          a({ node, children, ...props }) {
            return (
              <a target="_blank" rel="noopener noreferrer" className="text-accent hover:underline decoration-accent/30" {...props}>
                {children}
              </a>
            );
          },
          table({ node, children, ...props }) {
            return (
              <div className="overflow-x-auto my-4 border border-border rounded-lg">
                <table className="w-full text-left text-sm m-0" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ node, children, ...props }) {
            return <th className="bg-panel p-3 font-semibold border-b border-border" {...props}>{children}</th>;
          },
          td({ node, children, ...props }) {
            return <td className="p-3 border-b border-border/50 bg-surface/50" {...props}>{children}</td>;
          },
          p({ node, children, ...props }) {
            return <p className="leading-relaxed text-white/90" {...props}>{children}</p>;
          },
          li({ node, children, ...props }) {
            return <li className="text-white/80" {...props}>{children}</li>;
          },
          h1({ node, children, ...props }) {
            return <h1 className="text-white/90 font-semibold" {...props}>{children}</h1>;
          },
          h2({ node, children, ...props }) {
            return <h2 className="text-white/90 font-semibold mt-6 mb-3" {...props}>{children}</h2>;
          },
          h3({ node, children, ...props }) {
            return <h3 className="text-white/90 font-semibold mt-4 mb-2" {...props}>{children}</h3>;
          }
        }}
      >
        {safeContent}
      </Markdown>
    </div>
  );
}

function CodeBlock({ match, children, props }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  
  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-md overflow-hidden border border-border">
      <div className="flex justify-between items-center bg-panel px-4 py-1.5 text-xs text-muted border-b border-border">
        <span className="uppercase tracking-wider">{match[1]}</span>
        <button 
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white flex items-center gap-1 cursor-pointer"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        customStyle={{ margin: 0, background: '#0d1117', fontSize: '0.85rem', padding: '1rem' }}
        {...props}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}
