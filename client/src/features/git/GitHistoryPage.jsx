import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRepository } from '../../shared/context/RepositoryContext';
import {
  User,
  GitBranch,
  TerminalSquare,
  AlertCircle,
  RefreshCw,
  GitCommit,
  GitMerge,
  Cpu,
  Check,
  Info,
  Search,
  ChevronRight,
  ChevronDown,
  Tag,
  GitPullRequest,
  ArrowRight,
  Users,
  Copy,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import * as persistenceStore from '../../services/analyzer/repository/persistence.store.js';
import { startAnalysis, onProgress, initWorker } from '../../services/analyzer/analyzer.client.js';

// ─── Git-Themed Animated Loader (unchanged behaviour) ────────────────────────
function GitLoader({ phase }) {
  const phases = [
    { key: 'hydrating', label: 'Hydrating Git filesystem…', icon: Cpu },
    { key: 'reading', label: 'Reading commit history…', icon: GitCommit },
    { key: 'diffing', label: 'Diffing commit trees…', icon: GitMerge },
    { key: 'finalizing', label: 'Computing churn scores…', icon: GitBranch },
  ];

  const activeIndex = phase?.includes('Hydrating')
    ? 0
    : phase?.includes('Reading')
      ? 1
      : phase?.includes('Diffing')
        ? 2
        : 3;

  return (
    <div className="h-full flex flex-col items-center justify-center bg-surface p-8 gap-10">
      <div className="relative flex items-center justify-center h-28 mb-4">
        <style>
          {`
            @keyframes drawPath { 0% { stroke-dashoffset: 150; } 40%, 100% { stroke-dashoffset: 0; } }
            @keyframes drawBranch { 0%, 15% { stroke-dashoffset: 150; } 50%, 100% { stroke-dashoffset: 0; } }
            @keyframes popNode { 0%, 20% { transform: scale(0); opacity: 0; } 30%, 100% { transform: scale(1); opacity: 1; } }
            @keyframes popBranchNode { 0%, 35% { transform: scale(0); opacity: 0; } 45%, 100% { transform: scale(1); opacity: 1; } }
            @keyframes popMergeNode { 0%, 55% { transform: scale(0); opacity: 0; } 65%, 100% { transform: scale(1); opacity: 1; } }
            @keyframes fadeCycle { 0%, 80% { opacity: 1; } 90%, 100% { opacity: 0; } }
          `}
        </style>
        <svg viewBox="0 0 120 60" className="w-36 h-24 overflow-visible" style={{ animation: 'fadeCycle 3s infinite' }}>
          <path
            d="M 10 40 L 110 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-accent"
            style={{ strokeDasharray: 150, animation: 'drawPath 3s infinite ease-in-out' }}
          />
          <path
            d="M 35 40 C 45 40, 45 10, 60 10 C 75 10, 75 40, 85 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-purple-500"
            style={{ strokeDasharray: 150, animation: 'drawBranch 3s infinite ease-in-out' }}
          />
          <circle
            cx="10"
            cy="40"
            r="5"
            className="fill-surface stroke-accent stroke-[3px]"
            style={{ transformOrigin: '10px 40px', animation: 'popNode 3s infinite' }}
          />
          <circle
            cx="35"
            cy="40"
            r="5"
            className="fill-surface stroke-accent stroke-[3px]"
            style={{ transformOrigin: '35px 40px', animation: 'popNode 3s infinite' }}
          />
          <circle
            cx="60"
            cy="10"
            r="5"
            className="fill-surface stroke-purple-500 stroke-[3px]"
            style={{ transformOrigin: '60px 10px', animation: 'popBranchNode 3s infinite' }}
          />
          <circle
            cx="85"
            cy="40"
            r="5"
            className="fill-surface stroke-accent stroke-[3px]"
            style={{ transformOrigin: '85px 40px', animation: 'popMergeNode 3s infinite' }}
          />
          <circle
            cx="110"
            cy="40"
            r="5"
            className="fill-surface stroke-accent stroke-[3px]"
            style={{ transformOrigin: '110px 40px', animation: 'popMergeNode 3s infinite' }}
          />
        </svg>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {phases.map((p, i) => {
          const Icon = p.icon;
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          return (
            <div
              key={p.key}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${
                isActive
                  ? 'bg-accent/10 border-accent/40'
                  : isDone
                    ? 'bg-panel border-border opacity-60'
                    : 'border-border/40 opacity-30'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${isActive ? 'bg-accent/20' : 'bg-surface'}`}>
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-accent animate-pulse' : isDone ? 'text-success' : 'text-muted'}`}
                />
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-text' : 'text-muted'}`}>{p.label}</span>
              {isActive && (
                <div className="ml-auto flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              )}
              {isDone && (
                <div className="ml-auto w-4 h-4 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-success" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {phase && <p className="text-xs text-muted font-mono animate-pulse text-center max-w-xs truncate">{phase}</p>}
    </div>
  );
}

// ─── Constants & helpers ──────────────────────────────────────────────────────
const TRACK_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
const ROW_HEIGHT = 40;
const COL_WIDTH = 18;
const DOT_RADIUS = 4.5;
const PADDING_X = 16;
const PADDING_Y = ROW_HEIGHT / 2;

const firstLine = c => (c?.commit?.message || '').split('\n')[0].trim();
const cleanRef = r => r.replace(/^refs\/(remotes\/origin|remotes|heads|tags)\//, '');
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtFull = ts => new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const initials = name =>
  (name || '?')
    .split(/\s+/)
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// Same lane algorithm as before, now memoised and O(n) for parent lookup.
function buildGraph(commits) {
  const nodes = [];
  const tracks = [];

  commits.forEach((commit, rowIndex) => {
    let colIndex = tracks.indexOf(commit.oid);
    if (colIndex === -1) {
      colIndex = tracks.findIndex(t => !t);
      if (colIndex === -1) colIndex = tracks.length;
    }
    nodes.push({ ...commit, row: rowIndex, col: colIndex });

    for (let i = 0; i < tracks.length; i++) if (tracks[i] === commit.oid) tracks[i] = null;

    if (commit.commit.parent && commit.commit.parent.length > 0) {
      const mainParent = commit.commit.parent[0];
      if (!tracks.includes(mainParent)) tracks[colIndex] = mainParent;
      for (let i = 1; i < commit.commit.parent.length; i++) {
        const p = commit.commit.parent[i];
        if (!tracks.includes(p)) {
          let emptyIdx = tracks.findIndex(t => !t);
          if (emptyIdx === -1) emptyIdx = tracks.length;
          tracks[emptyIdx] = p;
        }
      }
    }
  });

  const byOid = new Map(nodes.map(n => [n.oid, n]));
  const children = new Map();
  const lines = [];

  nodes.forEach(node => {
    node.commit.parent?.forEach(p_oid => {
      if (!children.has(p_oid)) children.set(p_oid, []);
      children.get(p_oid).push(node.oid);
      const parentNode = byOid.get(p_oid);
      if (parentNode) {
        lines.push({
          key: `${node.oid}-${p_oid}`,
          x1: node.col,
          y1: node.row,
          x2: parentNode.col,
          y2: parentNode.row,
          colorIndex: Math.max(node.col, parentNode.col),
          from: node.oid,
          to: p_oid,
        });
      } else {
        lines.push({
          key: `${node.oid}-fade`,
          x1: node.col,
          y1: node.row,
          x2: node.col,
          y2: node.row + 1,
          colorIndex: node.col,
          fade: true,
          from: node.oid,
          to: null,
        });
      }
    });
  });

  const maxCol = Math.max(...nodes.map(n => n.col), 0);
  return { nodes, lines, byOid, children, maxCol };
}

// Nested branch tree from refs (feature/x → feature → x)
function buildRefTree(nodes) {
  const root = { name: '', path: '', children: {}, oid: null };
  nodes.forEach(n => {
    (n.refs || []).forEach(r => {
      const parts = cleanRef(r).split('/').filter(Boolean);
      let cur = root;
      parts.forEach((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        if (!cur.children[part]) cur.children[part] = { name: part, path, children: {}, oid: null };
        cur = cur.children[part];
      });
      if (!cur.oid) {
        cur.oid = n.oid;
        cur.col = n.col;
        cur.isTag = /refs\/tags\//.test(r);
      }
    });
  });
  return root;
}

// ─── Branch & merge analysis (derived only from existing commit fields) ───────
const DAY = 86400;
const relTime = ts => {
  const d = Math.max(0, Date.now() / 1000 - ts);
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < DAY) return `${Math.floor(d / 3600)}h ago`;
  if (d < DAY * 30) return `${Math.floor(d / DAY)}d ago`;
  return `${Math.floor(d / (DAY * 30))}mo ago`;
};

function analyzeBranches(graph) {
  const { nodes, byOid } = graph;
  const empty = { branches: [], tags: [], merges: [], mergeInfo: new Map(), base: null };
  if (!nodes.length) return empty;
  const newest = Math.max(...nodes.map(n => n.commit.author.timestamp));

  const refMap = new Map();
  nodes.forEach(n =>
    (n.refs || []).forEach(r => {
      const name = cleanRef(r);
      if (name === 'HEAD' || refMap.has(name)) return;
      refMap.set(name, { name, node: n, isTag: /refs\/tags\//.test(r) });
    })
  );
  const all = [...refMap.values()];
  const heads = all.filter(r => !r.isTag);
  const tags = all.filter(r => r.isTag);

  const chainOf = oid => {
    const out = [];
    let cur = oid;
    while (cur && byOid.get(cur)) {
      out.push(cur);
      cur = byOid.get(cur).commit.parent?.[0];
    }
    return out;
  };
  const ancestorsOf = oid => {
    const seen = new Set();
    const stack = [oid];
    while (stack.length) {
      const o = stack.pop();
      if (seen.has(o) || !byOid.get(o)) continue;
      seen.add(o);
      byOid.get(o).commit.parent?.forEach(p => stack.push(p));
    }
    return seen;
  };

  const base =
    heads.find(b => /^(main|master|trunk)$/.test(b.name)) ||
    heads.find(b => b.name === 'develop') ||
    [...heads].sort((a, b) => chainOf(b.node.oid).length - chainOf(a.node.oid).length)[0] ||
    null;
  const baseAnc = base ? ancestorsOf(base.node.oid) : new Set();
  const baseChain = new Set(base ? chainOf(base.node.oid) : []);

  const branches = heads.map(b => {
    const isBase = b === base;
    const chain = chainOf(b.node.oid);
    let spine = chain;
    if (!isBase) {
      const cut = chain.findIndex(o => baseAnc.has(o));
      spine = cut === -1 ? chain : chain.slice(0, cut + 1);
    }
    const unique = chain.filter(o => !baseAnc.has(o)).length;
    const merged = !isBase && baseAnc.has(b.node.oid);
    const ts = b.node.commit.author.timestamp;
    const status = isBase ? 'default' : merged ? 'merged' : newest - ts > 30 * DAY ? 'stale' : 'active';
    return { ...b, isBase, lineage: new Set(spine), unique, chainLen: chain.length, status, ts };
  });
  branches.sort((a, b) => (a.isBase ? -1 : b.isBase ? 1 : b.ts - a.ts));

  const nameAt = oid => {
    const n = byOid.get(oid);
    const ref = n?.refs?.map(cleanRef).find(r => r !== 'HEAD');
    return ref || oid.substring(0, 7);
  };

  const merges = [];
  const mergeInfo = new Map();
  nodes.forEach(n => {
    const parents = n.commit.parent || [];
    if (parents.length < 2) return;
    const msg = firstLine(n);
    let source = null,
      target = null,
      pr = null,
      m;
    if ((m = msg.match(/Merge pull request #(\d+) from (\S+)/))) {
      pr = m[1];
      source = m[2].split('/').slice(1).join('/') || m[2];
    } else if ((m = msg.match(/Merge (?:remote-tracking )?branch '([^']+)'(?: of \S+)?(?: into (\S+))?/))) {
      source = m[1];
      target = m[2] || null;
    }
    if (!source) source = nameAt(parents[1]);
    if (!target) target = baseChain.has(n.oid) && base ? base.name : nameAt(parents[0]);
    const srcNode = byOid.get(parents[1]);
    const tgtNode = byOid.get(parents[0]);
    const info = {
      oid: n.oid,
      node: n,
      source,
      target,
      pr,
      count: parents.length - 1,
      srcCol: srcNode ? srcNode.col : n.col + 1,
      tgtCol: tgtNode ? tgtNode.col : n.col,
    };
    merges.push(info);
    mergeInfo.set(n.oid, info);
  });

  return { branches, tags, merges, mergeInfo, base };
}

// ─── Left pane: branches, merges, contributors ───────────────────────────────────
function RefTreeNode({ node, depth, collapsed, toggle, onPick, selectedOid }) {
  const kids = Object.values(node.children);
  const isFolder = kids.length > 0;
  const isOpen = !collapsed.has(node.path);
  const color = TRACK_COLORS[(node.col ?? 0) % TRACK_COLORS.length];
  return (
    <div>
      <button
        onClick={() => (node.oid ? onPick(node.oid) : toggle(node.path))}
        className={`w-full flex items-center gap-1.5 py-1 pr-2 rounded-md text-[12px] text-left transition-colors hover:bg-surface ${
          node.oid && node.oid === selectedOid ? 'bg-accent/10 text-text' : 'text-muted hover:text-text'
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {isFolder ? (
          <span
            onClick={e => {
              e.stopPropagation();
              toggle(node.path);
            }}
            className="shrink-0"
          >
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.oid ? (
          node.isTag ? (
            <Tag className="w-3 h-3 shrink-0" style={{ color }} />
          ) : (
            <GitBranch className="w-3 h-3 shrink-0" style={{ color }} />
          )
        ) : null}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isFolder && isOpen && (
        <div className="ml-[13px] border-l border-border/60">
          {kids.map(k => (
            <RefTreeNode
              key={k.path}
              node={k}
              depth={depth}
              collapsed={collapsed}
              toggle={toggle}
              onPick={onPick}
              selectedOid={selectedOid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  default: 'text-accent bg-accent/10 border-accent/30',
  active: 'text-success bg-success/10 border-success/30',
  merged: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  stale: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};
const colorOf = col => TRACK_COLORS[col % TRACK_COLORS.length];

function StatusBadge({ status }) {
  return (
    <span className={`text-[9.5px] leading-none px-1.5 py-1 rounded-full border ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

function BranchCard({ b, focused, maxUnique, onClick }) {
  const color = colorOf(b.node.col);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
        focused ? 'bg-accent/10 border-accent/40' : 'border-border/60 hover:bg-surface hover:border-border'
      }`}
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <GitBranch className="w-3 h-3 shrink-0" style={{ color }} />
        <span className="font-mono text-[12px] text-text truncate" title={b.name}>
          {b.name}
        </span>
        <span className="ml-auto shrink-0">
          <StatusBadge status={b.status} />
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5 pl-5 text-[10.5px] text-muted">
        <code className="font-mono">{b.node.oid.substring(0, 7)}</code>
        <span>{relTime(b.ts)}</span>
        <span className="ml-auto font-mono">{b.isBase ? `${b.chainLen} commits` : `+${b.unique}`}</span>
      </div>
      {!b.isBase && (
        <div className="h-[3px] mt-1.5 ml-5 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(6, (b.unique / maxUnique) * 100)}%`, background: color }}
          />
        </div>
      )}
    </button>
  );
}

function MergeGlyph({ src, tgt }) {
  return (
    <svg width="22" height="38" viewBox="0 0 22 38" className="shrink-0">
      <path d="M6 0 V38" stroke={tgt} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M17 3 V8 C17 17 6 15 6 24" stroke={src} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="17" cy="4" r="3" fill={src} />
      <circle cx="6" cy="24" r="4" fill="#0c0e14" stroke={tgt} strokeWidth="2.5" />
    </svg>
  );
}

function MergeCard({ m, selected, onClick, onHover }) {
  const src = colorOf(m.srcCol);
  const tgt = colorOf(m.tgtCol);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(m.oid)}
      onMouseLeave={() => onHover(null)}
      className={`w-full flex items-center gap-2 text-left rounded-lg border px-2 py-1.5 transition-colors ${
        selected ? 'bg-accent/10 border-accent/40' : 'border-border/60 hover:bg-surface hover:border-border'
      }`}
    >
      <MergeGlyph src={src} tgt={tgt} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[11px] font-mono min-w-0">
          <span
            className="truncate max-w-[84px] px-1.5 py-0.5 rounded-full border"
            style={{ color: src, borderColor: src + '55', background: src + '18' }}
            title={m.source}
          >
            {m.source}
          </span>
          <ArrowRight className="w-3 h-3 text-muted shrink-0" />
          <span
            className="truncate max-w-[70px] px-1.5 py-0.5 rounded-full border"
            style={{ color: tgt, borderColor: tgt + '55', background: tgt + '18' }}
            title={m.target}
          >
            {m.target}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10.5px] text-muted">
          {m.pr && <span className="text-accent">#{m.pr}</span>}
          <code className="font-mono">{m.oid.substring(0, 7)}</code>
          <span className="truncate">{m.node.commit.author.name.split(' ')[0]}</span>
          <span className="ml-auto shrink-0">{fmtDate(m.node.commit.author.timestamp)}</span>
        </div>
      </div>
    </button>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex p-0.5 rounded-lg bg-surface border border-border">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            value === o.key ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sidebar({
  nodes,
  selectedOid,
  onPick,
  authorFilter,
  setAuthorFilter,
  info,
  focusBranch,
  setFocusBranch,
  setHoverOid,
  showMobile,
  setShowMobile,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [tab, setTab] = useState('branches');
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const tree = useMemo(() => buildRefTree(nodes), [nodes]);
  const topKids = Object.values(tree.children);

  const authors = useMemo(() => {
    const m = new Map();
    nodes.forEach(n => m.set(n.commit.author.name, (m.get(n.commit.author.name) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [nodes]);
  const maxCount = authors[0]?.[1] || 1;

  const counts = useMemo(() => {
    const c = { all: info.branches.length, active: 0, merged: 0, stale: 0 };
    info.branches.forEach(b => {
      if (c[b.status] !== undefined) c[b.status]++;
    });
    return c;
  }, [info]);
  const shown = info.branches.filter(
    b => statusFilter === 'all' || b.status === statusFilter || (statusFilter === 'active' && b.isBase)
  );
  const maxUnique = Math.max(...info.branches.map(b => b.unique), 1);

  const toggle = p =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  const clickBranch = b => {
    setFocusBranch(focusBranch === b.name ? null : b.name);
    onPick(b.node.oid);
  };

  return (
    <aside
      className={`${showMobile ? 'flex absolute inset-0 z-50' : 'hidden'} lg:static lg:flex w-full lg:w-72 shrink-0 flex-col border-r border-border bg-panel overflow-y-auto`}
    >
      {showMobile && (
        <div className="flex items-center justify-between p-3 border-b border-border bg-surface lg:hidden">
          <h2 className="text-sm font-semibold text-text flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filters & Branches
          </h2>
          <button
            onClick={() => setShowMobile(false)}
            className="p-1.5 rounded-lg bg-panel border border-border text-muted hover:text-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <section className="p-3 border-b border-border space-y-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'branches', label: `Branches ${info.branches.length}`, icon: <GitBranch className="w-3 h-3" /> },
            { key: 'merges', label: `Merges ${info.merges.length}`, icon: <GitPullRequest className="w-3 h-3" /> },
          ]}
        />

        {tab === 'branches' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {['all', 'active', 'merged', 'stale'].map(k => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    className={`px-2 py-0.5 rounded-full text-[10.5px] border transition-colors ${
                      statusFilter === k
                        ? 'bg-accent/10 border-accent/40 text-accent'
                        : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {k} {counts[k]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setView(view === 'list' ? 'tree' : 'list')}
                className="text-[10.5px] text-muted hover:text-accent shrink-0"
                title="Switch between cards and folder tree"
              >
                {view === 'list' ? 'Tree view' : 'Card view'}
              </button>
            </div>

            {view === 'list' ? (
              <div className="space-y-1.5">
                {shown.length === 0 && <p className="text-xs text-muted px-1">No branches match this filter.</p>}
                {shown.map(b => (
                  <BranchCard
                    key={b.name}
                    b={b}
                    focused={focusBranch === b.name}
                    maxUnique={maxUnique}
                    onClick={() => clickBranch(b)}
                  />
                ))}
                {info.tags.length > 0 && (
                  <div className="pt-2">
                    <p className="flex items-center gap-1.5 text-[10.5px] text-muted px-1 mb-1">
                      <Tag className="w-3 h-3" /> Tags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {info.tags.map(t => (
                        <button
                          key={t.name}
                          onClick={() => onPick(t.node.oid)}
                          className="px-1.5 py-0.5 rounded-md border border-border text-[10.5px] font-mono text-muted hover:text-accent hover:border-accent/40"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : topKids.length === 0 ? (
              <p className="text-xs text-muted px-1">No refs recorded for these commits.</p>
            ) : (
              <div>
                {topKids.map(k => (
                  <RefTreeNode
                    key={k.path}
                    node={k}
                    depth={0}
                    collapsed={collapsed}
                    toggle={toggle}
                    onPick={onPick}
                    selectedOid={selectedOid}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'merges' && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted px-1">
              {info.merges.length === 0
                ? 'No merge commits in this window.'
                : `${info.merges.length} merge${info.merges.length !== 1 ? 's' : ''} into ${new Set(info.merges.map(m => m.target)).size} target${new Set(info.merges.map(m => m.target)).size !== 1 ? 's' : ''}. Newest first.`}
            </p>
            {info.merges.map(m => (
              <MergeCard
                key={m.oid}
                m={m}
                selected={m.oid === selectedOid}
                onClick={() => onPick(m.oid)}
                onHover={setHoverOid}
              />
            ))}
          </div>
        )}
      </section>

      <section className="p-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-text mb-2 px-1">
          <Users className="w-3.5 h-3.5 text-accent" /> Contributors
        </h2>
        <div className="space-y-1">
          {authors.map(([name, count], i) => {
            const active = authorFilter === name;
            return (
              <button
                key={name}
                onClick={() => setAuthorFilter(active ? null : name)}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${active ? 'bg-accent/10' : 'hover:bg-surface'}`}
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="truncate text-text">{name}</span>
                  <span className="text-muted font-mono">{count}</span>
                </div>
                <div className="h-1 mt-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / maxCount) * 100}%`, background: TRACK_COLORS[i % TRACK_COLORS.length] }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

// ─── Center: graph ───────────────────────────────────────────────────────────
function GitGraphVisualizer({ graph, selectedOid, onSelect, matches, hoverOid, setHoverOid, mergeInfo }) {
  const { nodes, lines, maxCol } = graph;
  const svgWidth = PADDING_X * 2 + maxCol * COL_WIDTH;
  const totalHeight = nodes.length * ROW_HEIGHT;

  // Lines connected to the hovered/selected commit light up
  const focus = hoverOid || selectedOid;

  return (
    <div className="flex w-fit min-w-full" style={{ height: totalHeight }}>
      <div className="shrink-0 relative" style={{ width: svgWidth }}>
        <svg width={svgWidth} height={totalHeight} className="absolute top-0 left-0 z-0">
          <style>{`@keyframes ghFade { from { opacity: 0 } to { opacity: var(--o, .8) } }`}</style>

          {lines.map(line => {
            const x1 = PADDING_X + line.x1 * COL_WIDTH;
            const y1 = PADDING_Y + line.y1 * ROW_HEIGHT;
            const x2 = PADDING_X + line.x2 * COL_WIDTH;
            const y2 = PADDING_Y + line.y2 * ROW_HEIGHT;
            const mid = y1 + (y2 - y1) / 2;
            const d =
              line.x1 === line.x2
                ? `M ${x1} ${y1} L ${x2} ${y2}`
                : `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
            const hot = focus && (line.from === focus || line.to === focus);
            return (
              <path
                key={line.key}
                d={d}
                fill="none"
                stroke={TRACK_COLORS[line.colorIndex % TRACK_COLORS.length]}
                strokeWidth={hot ? 3.5 : 2.5}
                strokeLinecap="round"
                strokeDasharray={line.fade ? '3 4' : undefined}
                style={{
                  '--o': line.fade ? 0.25 : hot ? 1 : focus ? 0.4 : 0.8,
                  animation: 'ghFade .6s ease-out both',
                  opacity: line.fade ? 0.25 : hot ? 1 : focus ? 0.4 : 0.8,
                }}
              />
            );
          })}

          {nodes.map(node => {
            const x = PADDING_X + node.col * COL_WIDTH;
            const y = PADDING_Y + node.row * ROW_HEIGHT;
            const color = TRACK_COLORS[node.col % TRACK_COLORS.length];
            const isMerge = node.commit.parent?.length > 1;
            const sel = node.oid === selectedOid;
            const dim = matches && !matches.has(node.oid);
            return (
              <g
                key={node.oid}
                onClick={() => onSelect(node.oid)}
                onMouseEnter={() => setHoverOid(node.oid)}
                onMouseLeave={() => setHoverOid(null)}
                className="cursor-pointer"
                opacity={dim ? 0.25 : 1}
              >
                {sel && <circle cx={x} cy={y} r={DOT_RADIUS + 6} fill={color} opacity="0.22" />}
                <circle cx={x} cy={y} r={DOT_RADIUS + 3} fill="#0c0e14" />
                {isMerge ? (
                  <circle cx={x} cy={y} r={DOT_RADIUS + 0.5} fill="#0c0e14" stroke={color} strokeWidth="2.5" />
                ) : (
                  <circle cx={x} cy={y} r={DOT_RADIUS} fill={color} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex-1 flex flex-col min-w-[420px] z-10 relative">
        {nodes.map(node => {
          const sel = node.oid === selectedOid;
          const dim = matches && !matches.has(node.oid);
          const color = TRACK_COLORS[node.col % TRACK_COLORS.length];
          const isMerge = node.commit.parent?.length > 1;
          const mi = mergeInfo?.get(node.oid);
          return (
            <div
              key={node.oid}
              id={`row-${node.oid}`}
              className="flex items-center pr-3"
              style={{ height: ROW_HEIGHT }}
            >
              <div
                onClick={() => onSelect(node.oid)}
                onMouseEnter={() => setHoverOid(node.oid)}
                onMouseLeave={() => setHoverOid(null)}
                className={`w-full h-[34px] flex items-center gap-3 px-2.5 rounded-md cursor-pointer border transition-colors ${
                  sel ? 'bg-accent/10 border-accent/40' : 'border-transparent hover:bg-panel'
                } ${dim ? 'opacity-30' : ''}`}
                style={sel ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
              >
                <code className="shrink-0 text-[11px] font-mono text-muted">{node.oid.substring(0, 7)}</code>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isMerge && <GitMerge className="w-3.5 h-3.5 shrink-0" style={{ color }} />}
                  {node.refs?.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {node.refs.slice(0, 2).map(r => (
                        <span
                          key={r}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border leading-none truncate max-w-[110px]"
                          style={{ color, borderColor: color + '55', background: color + '18' }}
                          title={r}
                        >
                          {cleanRef(r)}
                        </span>
                      ))}
                      {node.refs.length > 2 && <span className="text-[10px] text-muted">+{node.refs.length - 2}</span>}
                    </div>
                  )}
                  {mi && (
                    <span
                      className="hidden md:inline-flex items-center gap-1 shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full border max-w-[190px]"
                      style={{
                        color: colorOf(mi.srcCol),
                        borderColor: colorOf(mi.srcCol) + '55',
                        background: colorOf(mi.srcCol) + '14',
                      }}
                      title={`${mi.source} → ${mi.target}`}
                    >
                      <span className="truncate">{mi.source}</span>
                      <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{mi.target}</span>
                    </span>
                  )}
                  <span className="text-[13px] text-text/90 truncate" title={firstLine(node)}>
                    {firstLine(node)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted shrink-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-text bg-surface border border-border"
                    title={node.commit.author.name}
                  >
                    {initials(node.commit.author.name)}
                  </span>
                  <span className="w-[48px] text-right">{fmtDate(node.commit.author.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Right pane: inspector with ancestry tree ────────────────────────────────
function MiniCommit({ node, onPick, label, color }) {
  if (!node) return null;
  return (
    <button
      onClick={() => onPick(node.oid)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-surface transition-colors"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <code className="text-[11px] font-mono text-accent shrink-0">{node.oid.substring(0, 7)}</code>
      <span className="text-[12px] text-text/90 truncate">{firstLine(node)}</span>
      {label && <span className="ml-auto text-[10px] text-muted shrink-0">{label}</span>}
    </button>
  );
}

function ParentTree({ oid, graph, depth, onPick }) {
  const node = graph.byOid.get(oid);
  if (!node) {
    return (
      <p className="text-[11px] text-muted px-2 py-1 italic">{oid.substring(0, 7)} · older than the analysed window</p>
    );
  }
  const color = TRACK_COLORS[node.col % TRACK_COLORS.length];
  const parents = node.commit.parent || [];
  return (
    <div>
      <MiniCommit node={node} onPick={onPick} color={color} />
      {depth > 0 && parents.length > 0 && (
        <div className="ml-3 pl-2 border-l border-border/70">
          {parents.map(p => (
            <ParentTree key={p} oid={p} graph={graph} depth={depth - 1} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function Inspector({ node, graph, onPick, onClose, mergeInfo }) {
  const [copied, setCopied] = useState(false);
  if (!node) {
    return (
      <aside className="hidden xl:flex w-80 shrink-0 border-l border-border bg-panel items-center justify-center p-8 text-center">
        <div>
          <GitCommit className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted leading-relaxed">
            Select a commit to see its message, parents, children and ancestry.
          </p>
        </div>
      </aside>
    );
  }
  const color = TRACK_COLORS[node.col % TRACK_COLORS.length];
  const kids = (graph.children.get(node.oid) || []).map(o => graph.byOid.get(o)).filter(Boolean);
  const parents = node.commit.parent || [];
  const lines = (node.commit.message || '').split('\n');
  const body = lines.slice(1).join('\n').trim();

  const copy = () => {
    navigator.clipboard?.writeText(node.oid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className="flex absolute inset-x-0 bottom-0 top-[35%] z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.7)] rounded-t-2xl border-t border-border xl:shadow-none xl:rounded-none xl:static xl:w-80 shrink-0 flex-col xl:border-l xl:border-t-0 bg-panel overflow-y-auto">
      <div className="p-4 border-b border-border" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-text leading-snug">{lines[0]}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface text-muted shrink-0" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {body && <p className="text-xs text-muted mt-2 whitespace-pre-wrap leading-relaxed">{body}</p>}

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted">
            <User className="w-3.5 h-3.5" />
            <span className="text-text">{node.commit.author.name}</span>
          </div>
          <div className="text-muted pl-5">{fmtFull(node.commit.author.timestamp)}</div>
          <button
            onClick={copy}
            className="flex items-center gap-2 font-mono text-[11px] text-muted hover:text-accent transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            {node.oid.substring(0, 12)}
          </button>
        </div>

        {node.refs?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {node.refs.map(r => (
              <span
                key={r}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border"
                style={{ color, borderColor: color + '55', background: color + '18' }}
              >
                {cleanRef(r)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 space-y-4">
        {mergeInfo?.get(node.oid) &&
          (() => {
            const mi = mergeInfo.get(node.oid);
            const src = colorOf(mi.srcCol);
            const tgt = colorOf(mi.tgtCol);
            return (
              <section className="rounded-lg border border-border bg-surface p-3">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-muted mb-2">
                  <GitPullRequest className="w-3.5 h-3.5 text-accent" />
                  Merge {mi.pr ? `#${mi.pr}` : ''}
                </h3>
                <div className="flex items-center gap-2">
                  <MergeGlyph src={src} tgt={tgt} />
                  <div className="min-w-0 text-[12px] font-mono space-y-1">
                    <div className="truncate" style={{ color: src }} title={mi.source}>
                      {mi.source}
                    </div>
                    <div className="text-muted text-[10px]">merged into</div>
                    <div className="truncate" style={{ color: tgt }} title={mi.target}>
                      {mi.target}
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}
        <section>
          <h3 className="text-[11px] font-semibold text-muted px-2 mb-1">Children ({kids.length})</h3>
          {kids.length === 0 ? (
            <p className="text-[11px] text-muted px-2 italic">Branch tip: nothing builds on this commit.</p>
          ) : (
            kids.map(k => (
              <MiniCommit key={k.oid} node={k} onPick={onPick} color={TRACK_COLORS[k.col % TRACK_COLORS.length]} />
            ))
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold text-muted px-2 mb-1">
            Ancestry {parents.length > 1 && <span className="text-accent">· merge of {parents.length}</span>}
          </h3>
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md bg-accent/10 border border-accent/30">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <code className="text-[11px] font-mono text-text">{node.oid.substring(0, 7)}</code>
            <span className="text-[11px] text-muted">this commit</span>
          </div>
          {parents.length === 0 ? (
            <p className="text-[11px] text-muted px-2 italic">Root commit.</p>
          ) : (
            <div className="ml-3 pl-2 border-l border-border/70">
              {parents.map(p => (
                <ParentTree key={p} oid={p} graph={graph} depth={2} onPick={onPick} />
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

// ─── Header stats & activity ─────────────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div className="px-3 py-1.5 rounded-lg bg-surface border border-border">
      <div className="text-[15px] font-semibold text-text leading-tight">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function ActivityStrip({ commits }) {
  const bins = useMemo(() => {
    const DAYS = 90;
    const now = Date.now() / 1000;
    const arr = new Array(DAYS).fill(0);
    commits.forEach(c => {
      const d = Math.floor((now - c.commit.author.timestamp) / 86400);
      if (d >= 0 && d < DAYS) arr[DAYS - 1 - d]++;
    });
    return arr;
  }, [commits]);
  const max = Math.max(...bins, 1);
  return (
    <div className="hidden md:flex items-end gap-[2px] h-9" title="Commits per day, last 90 days">
      {bins.map((v, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-accent"
          style={{ height: `${Math.max(v ? 14 : 4, (v / max) * 100)}%`, opacity: v ? 0.4 + (v / max) * 0.6 : 0.15 }}
        />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GitHistoryPage() {
  const { repoId } = useRepository();
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [gitPhase, setGitPhase] = useState(null);
  const [error, setError] = useState(null);

  const [selectedOid, setSelectedOid] = useState(null);
  const [hoverOid, setHoverOid] = useState(null);
  const [query, setQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState(null);
  const [focusBranch, setFocusBranch] = useState(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const scrollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await persistenceStore.load(repoId);
      if (!meta?.analysis?.gitChurn?.commits?.length) {
        throw new Error(
          'No Git history found. This repository was likely uploaded without a .git folder or is not a git repository.'
        );
      }
      setCommits(meta.analysis.gitChurn.commits);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    initWorker();
    const unsub = onProgress(msg => {
      if (msg.repoId !== repoId) return;
      if (msg.phase === 'analyzing_git_churn' && msg.details) setGitPhase(msg.details);
      if (msg.type === 'COMPLETE') {
        setReanalyzing(false);
        setGitPhase(null);
        loadHistory();
      }
      if (msg.type === 'ERROR') {
        setReanalyzing(false);
        setGitPhase(null);
        setError('Analysis failed: ' + msg.error);
        setLoading(false);
      }
    });
    return unsub;
  }, [repoId, loadHistory]);

  const handleReanalyze = () => {
    setReanalyzing(true);
    setError(null);
    setGitPhase('Hydrating Git filesystem…');
    startAnalysis(repoId, {}).catch(err => {
      setReanalyzing(false);
      setGitPhase(null);
      setError('Re-analysis failed: ' + err.message);
    });
  };

  const graph = useMemo(() => buildGraph(commits), [commits]);
  const info = useMemo(() => analyzeBranches(graph), [graph]);

  // Search / author filter dims non-matching rows so the graph topology stays intact
  const textMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !authorFilter) return null;
    const set = new Set();
    graph.nodes.forEach(n => {
      const okAuthor = !authorFilter || n.commit.author.name === authorFilter;
      const okQuery =
        !q ||
        firstLine(n).toLowerCase().includes(q) ||
        n.oid.startsWith(q) ||
        n.commit.author.name.toLowerCase().includes(q) ||
        (n.refs || []).some(r => r.toLowerCase().includes(q));
      if (okAuthor && okQuery) set.add(n.oid);
    });
    return set;
  }, [graph, query, authorFilter]);

  // Branch focus: keep only that branch's own commits bright, then intersect with search/author filter
  const matches = useMemo(() => {
    const focus = focusBranch ? info.branches.find(b => b.name === focusBranch)?.lineage : null;
    if (!focus) return textMatches;
    if (!textMatches) return focus;
    return new Set([...focus].filter(o => textMatches.has(o)));
  }, [info, focusBranch, textMatches]);

  const stats = useMemo(() => {
    const authors = new Set(commits.map(c => c.commit.author.name));
    const merges = commits.filter(c => c.commit.parent?.length > 1).length;
    return { authors: authors.size, merges, lanes: graph.maxCol + 1 };
  }, [commits, graph]);

  const selectedNode = selectedOid ? graph.byOid.get(selectedOid) : null;

  const pick = useCallback(oid => {
    setSelectedOid(oid);
    requestAnimationFrame(() =>
      document.getElementById(`row-${oid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    );
  }, []);

  const onKeyDown = e => {
    const idx = selectedOid ? graph.nodes.findIndex(n => n.oid === selectedOid) : -1;
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const n = graph.nodes[Math.min(idx + 1, graph.nodes.length - 1)];
      n && pick(n.oid);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const n = graph.nodes[Math.max(idx - 1, 0)];
      n && pick(n.oid);
    } else if (e.key === 'Escape') {
      setSelectedOid(null);
    }
  };

  if (reanalyzing) return <GitLoader phase={gitPhase} />;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    const isMissingGit = error.includes('without a .git folder');
    return (
      <div className="h-full flex items-center justify-center bg-surface p-8">
        <div
          className={`max-w-md w-full bg-panel border ${isMissingGit ? 'border-border' : 'border-danger/30'} rounded-2xl p-8 text-center`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${isMissingGit ? 'bg-surface border border-border' : 'bg-danger/10'}`}
          >
            {isMissingGit ? (
              <GitCommit className="w-8 h-8 text-muted" />
            ) : (
              <AlertCircle className="w-8 h-8 text-danger" />
            )}
          </div>
          <h3 className="text-xl font-semibold text-text mb-3">
            {isMissingGit ? 'No Git History' : 'Analysis Failed'}
          </h3>
          <p className="text-muted text-sm leading-relaxed mb-8 px-4">{error}</p>
          {!isMissingGit && (
            <button
              onClick={handleReanalyze}
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-danger/10 text-danger text-sm font-semibold hover:bg-danger/20 transition-all active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface text-text overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-panel px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
              <GitBranch className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text">Git History</h1>
              <p className="text-xs text-muted mt-0.5">Last 90 days</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Stat label={`commit${commits.length !== 1 ? 's' : ''}`} value={commits.length} />
            <Stat label="authors" value={stats.authors} />
            <Stat label="merges" value={stats.merges} />
            <Stat label="lanes" value={stats.lanes} />
          </div>

          <ActivityStrip commits={commits} />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileSidebar(true)}
              title="Branches & Filters"
              className="lg:hidden flex items-center justify-center p-2 rounded-lg border border-border bg-panel hover:border-accent/40 hover:text-accent transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search message, hash, author"
                className="w-56 pl-8 pr-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            </div>
            {authorFilter && (
              <button
                onClick={() => setAuthorFilter(null)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent"
              >
                {authorFilter} <X className="w-3 h-3" />
              </button>
            )}
            {focusBranch && (
              <button
                onClick={() => setFocusBranch(null)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-xs text-accent font-mono"
                title="Clear branch focus"
              >
                <GitBranch className="w-3 h-3" /> {focusBranch} <X className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={handleReanalyze}
              title="Re-analyze Repository"
              className="p-2 rounded-lg border border-border hover:border-accent/40 hover:text-accent transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {commits.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center px-4">
            <div className="w-20 h-20 bg-panel border border-border rounded-2xl flex items-center justify-center mb-6 rotate-3">
              <TerminalSquare className="w-10 h-10 text-muted" />
            </div>
            <h2 className="text-2xl font-semibold text-text mb-3">No Git History Found</h2>
            <p className="text-muted leading-relaxed mb-8">
              We couldn't find any commit history. This usually happens because the{' '}
              <span className="font-mono text-xs bg-panel border border-border px-1.5 py-0.5 rounded text-text">
                .git
              </span>{' '}
              folder was not included in your upload.
            </p>
            <div className="w-full bg-panel border border-border rounded-xl p-5 text-left space-y-4">
              <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" />
                Common Reasons
              </h4>
              <ul className="text-sm text-muted space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>
                    <strong>GitHub "Download ZIP":</strong> GitHub strips the{' '}
                    <span className="font-mono text-[10px]">.git</span> folder when you download a repository as a ZIP.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>
                    <strong>Hidden OS folders:</strong> Windows and macOS hide the{' '}
                    <span className="font-mono text-[10px]">.git</span> folder by default, so it may have been skipped
                    when you selected the folder.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 relative">
          <Sidebar
            nodes={graph.nodes}
            selectedOid={selectedOid}
            onPick={pick}
            authorFilter={authorFilter}
            setAuthorFilter={setAuthorFilter}
            info={info}
            focusBranch={focusBranch}
            setFocusBranch={setFocusBranch}
            setHoverOid={setHoverOid}
            showMobile={showMobileSidebar}
            setShowMobile={setShowMobileSidebar}
          />

          <main
            ref={scrollRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 overflow-auto py-3 focus:outline-none"
          >
            <GitGraphVisualizer
              graph={graph}
              selectedOid={selectedOid}
              onSelect={setSelectedOid}
              matches={matches}
              hoverOid={hoverOid}
              setHoverOid={setHoverOid}
              mergeInfo={info.mergeInfo}
            />
          </main>

          <Inspector
            node={selectedNode}
            graph={graph}
            onPick={pick}
            onClose={() => setSelectedOid(null)}
            mergeInfo={info.mergeInfo}
          />
        </div>
      )}
    </div>
  );
}
