import React, { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, AlertCircle, Book, Folder, FileText, ExternalLink } from 'lucide-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';

// Simple Markdown Parser (no external dependencies)
function MarkdownViewer({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeContent = [];
  let codeLang = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="bg-[#1e1e1e] rounded p-4 my-4 overflow-x-auto border border-border">
            <pre><code className="text-sm font-mono text-gray-300">{codeContent.join('\n')}</code></pre>
          </div>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.trim().slice(3);
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(<h1 key={`h1-${i}`} className="text-3xl font-bold text-white mt-8 mb-4 border-b border-border/50 pb-2">{line.slice(2)}</h1>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={`h2-${i}`} className="text-2xl font-semibold text-white mt-8 mb-3">{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={`h3-${i}`} className="text-xl font-medium text-white mt-6 mb-2">{line.slice(4)}</h3>);
      continue;
    }
    
    // Unordered Lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(<li key={`li-${i}`} className="text-gray-300 ml-4 my-1">{renderInline(line.trim().slice(2))}</li>);
      continue;
    }

    // Blockquotes
    if (line.trim().startsWith('> ')) {
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-4 border-accent pl-4 py-1 my-4 text-gray-400 bg-surface/30 rounded-r">
          {renderInline(line.trim().slice(2))}
        </blockquote>
      );
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-4"></div>);
      continue;
    }

    // Normal Paragraph
    elements.push(<p key={`p-${i}`} className="text-gray-300 leading-relaxed my-2">{renderInline(line)}</p>);
  }

  return <div className="max-w-4xl mx-auto pb-20">{elements}</div>;
}

// Helper to render inline **bold**, `code`, and [links]
function renderInline(text) {
  // A very simple regex approach to inline formatting.
  // We split by parts and map.
  let parts = [];
  let current = "";
  let i = 0;
  
  while (i < text.length) {
    if (text.slice(i, i+2) === '**') {
      if (current) parts.push({ type: 'text', val: current });
      current = "";
      i += 2;
      let boldText = "";
      while (i < text.length && text.slice(i, i+2) !== '**') {
        boldText += text[i];
        i++;
      }
      parts.push({ type: 'bold', val: boldText });
      i += 2;
    } else if (text[i] === '`') {
      if (current) parts.push({ type: 'text', val: current });
      current = "";
      i++;
      let codeText = "";
      while (i < text.length && text[i] !== '`') {
        codeText += text[i];
        i++;
      }
      parts.push({ type: 'code', val: codeText });
      i++;
    } else if (text[i] === '[') {
      if (current) parts.push({ type: 'text', val: current });
      current = "";
      i++;
      let linkText = "";
      while (i < text.length && text[i] !== ']') {
        linkText += text[i];
        i++;
      }
      i++; // skip ']'
      if (text[i] === '(') {
        i++; // skip '('
        let linkUrl = "";
        while (i < text.length && text[i] !== ')') {
          linkUrl += text[i];
          i++;
        }
        parts.push({ type: 'link', text: linkText, url: linkUrl });
        i++; // skip ')'
      } else {
        parts.push({ type: 'text', val: `[${linkText}]` });
      }
    } else {
      current += text[i];
      i++;
    }
  }
  if (current) parts.push({ type: 'text', val: current });

  return parts.map((p, idx) => {
    if (p.type === 'bold') return <strong key={idx} className="text-white font-semibold">{p.val}</strong>;
    if (p.type === 'code') return <code key={idx} className="bg-surface px-1.5 py-0.5 rounded text-sm text-[#e5c07b] font-mono border border-border/50">{p.val}</code>;
    if (p.type === 'link') {
      const isExternal = p.url.startsWith('http');
      if (isExternal) {
        return <a key={idx} href={p.url} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">{p.text} <ExternalLink className="w-3 h-3"/></a>;
      }
      // Internal Markdown Link
      return <Link key={idx} to={`/help?path=${encodeURIComponent(p.url)}`} className="text-accent hover:underline">{p.text}</Link>;
    }
    return <span key={idx}>{p.val}</span>;
  });
}


export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentPath = searchParams.get('path') || 'README.md';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [actualPath, setActualPath] = useState(currentPath);

  useEffect(() => {
    let active = true;
    const fetchDoc = async () => {
      setLoading(true);
      setError(null);
      try {
        // Because HelpPage doesn't have a direct repoApi function, we can just use axios to /api/docs
        const res = await axios.get(`/api/docs?path=${encodeURIComponent(currentPath)}`);
        if (active) {
          setDocContent(res.data.content);
          setActualPath(res.data.path);
        }
      } catch (err) {
        if (active) {
          setError(err.response?.data?.error || err.message || 'Failed to load documentation');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDoc();
    return () => { active = false; };
  }, [currentPath]);

  const pathParts = actualPath.split('/');

  return (
    <div className="h-screen flex flex-col bg-surface text-white overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 border-b border-border bg-panel shrink-0 gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="h-4 w-px bg-border mx-1"></div>
        <div className="flex items-center gap-2 text-sm">
          <Book className="w-4 h-4 text-accent" />
          <span className="font-semibold">CodeLens Help Center</span>
        </div>
        
        <div className="flex items-center gap-1.5 ml-8 text-xs text-muted">
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              <span className="flex items-center gap-1">
                {part.endsWith('.md') ? <FileText className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
            <p className="text-sm text-muted">Loading documentation...</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <AlertCircle className="w-8 h-8 text-danger" />
            <p className="text-danger">{error}</p>
            <button onClick={() => setSearchParams({ path: 'README.md' })} className="mt-4 px-4 py-2 bg-panel border border-border rounded hover:bg-surface text-sm">
              Return to Home
            </button>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <MarkdownViewer content={docContent} />
          </div>
        )}
      </main>
    </div>
  );
}
