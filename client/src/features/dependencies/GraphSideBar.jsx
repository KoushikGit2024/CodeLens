/**
 * GraphSideBar.jsx
 *
 * It initiates the sidebar context panel, then extracts the selected node's dependencies and health metrics,
 * and then it applies them into readable lists and status chips.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, GitBranch, ExternalLink, Package, File, Info, Activity, Flame } from 'lucide-react';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { makeSourceRef } from '../../shared/navigation/sourceRef';

export function StatRow({ label, value, warn = false }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono ${warn && value > 0 ? 'text-warning' : 'text-text'}`}>{value}</span>
    </div>
  );
}

export function Chip({ label, color }) {
  const cls = color === 'accent' ? 'text-accent border-accent/30' : 'text-green-400 border-green-400/30';
  return <span className={`border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>;
}

export function DepEntry({ dep, repoId, reverse = false, onSelectNode }) {
  const name = dep.filePath ? dep.filePath.split('/').pop() : dep.package;
  const Icon = dep.package ? Package : File;
  const color = dep.package ? 'text-amber-400' : reverse ? 'text-green-400' : 'text-accent';
  const targetId = dep.filePath
    ? (dep.filePath.startsWith('file:') ? dep.filePath : `file:${dep.filePath}`)
    : `module:${dep.package}`;

  return (
    <div className="flex items-center gap-1.5 py-1 group border-b border-text/5 last:border-0 hover:bg-surface/50 rounded px-1 transition-colors">
      <button
        type="button"
        onClick={() => onSelectNode && onSelectNode(targetId)}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer focus:outline-none"
        title={`Focus ${dep.filePath || dep.package} in graph`}
      >
        <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
        <span className="text-text text-xs font-mono truncate hover:text-accent transition-colors" title={dep.filePath || dep.package}>
          {name}
        </span>
      </button>
      {dep.filePath && (
        <OpenSourceButton
          ref={makeSourceRef({ filePath: dep.filePath })}
          variant="icon"
          className="opacity-0 group-hover:opacity-100 bg-surface border-border shrink-0"
        />
      )}
    </div>
  );
}

export function FileDetailPanel({ info, repoId, graph, onSelectNode }) {
  const nodeCycles = graph?.cycles?.filter(c => c.includes(info.id || `file:${info.filePath}`)) || [];
  const isIsolated = graph?.nodes?.find(n => n.id === `file:${info.filePath}`)?.data?.isIsolated;

  const getSeverityColor = severity => {
    switch (severity) {
      case 'critical':
        return 'text-danger border-danger/30 bg-danger/10';
      case 'high':
        return 'text-warning border-warning/30 bg-warning/10';
      case 'warning':
        return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
      default:
        return 'text-success border-success/30 bg-success/10';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted uppercase tracking-wider mb-1.5 text-[10px] font-bold">File Information</p>
        <p className="text-text font-mono whitespace-nowrap overflow-x-auto custom-scrollbar pb-2 mb-2 text-xs bg-panel p-2 rounded border border-border">
          {info.filePath}
        </p>
        <div className="flex gap-2">
          <OpenSourceButton
            ref={makeSourceRef({ filePath: info.filePath })}
            variant="button"
            label="View Source"
            className="!bg-accent/10 !border-accent/40 !text-accent hover:!bg-accent/20"
          />
          {info.health && info.health.severity !== 'healthy' && (
            <Link
              to={`/explore/${repoId}/health?file=${encodeURIComponent(info.filePath)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface/50 border border-border/50 rounded text-muted hover:text-text transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              View Risks
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label={`${info.dependencyCount} deps (imports)`} color="accent" />
        <Chip label={`${info.dependentCount} users (imported by)`} color="success" />
        {info.health && (
          <span
            className={`border rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${getSeverityColor(info.health.severity)}`}
          >
            {info.health.severity !== 'healthy' ? (
              <AlertCircle className="w-3.5 h-3.5" />
            ) : (
              <GitBranch className="w-3.5 h-3.5" />
            )}
            {info.health.severity}
          </span>
        )}
      </div>

      {info.health?.hotspot && (
        <div className="bg-danger/10 border border-danger/30 p-3 rounded-lg flex items-start gap-2.5 shadow-sm">
          <Flame className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-danger uppercase tracking-wider">Hotspot File</span>
              {info.health.hotspot.quadrant && (
                <span className="text-[9px] px-1.5 py-0.5 bg-danger/20 text-danger rounded font-semibold uppercase">
                  {info.health.hotspot.quadrant.replace('_', ' ')}
                </span>
              )}
            </div>
            <span className="text-[11px] text-danger/80 leading-relaxed mt-1">
              High churn & complexity risk (Score: {info.health.hotspot.score})
            </span>
            {(info.health.hotspot.churnScore != null || info.health.hotspot.complexityScore != null) && (
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-muted">
                {info.health.hotspot.churnScore != null && <span>Churn: {info.health.hotspot.churnScore}/100</span>}
                {info.health.hotspot.complexityScore != null && <span>CC: {info.health.hotspot.complexityScore}/100</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {isIsolated && (
        <div className="bg-surface/50 border border-border/50 p-2.5 rounded-lg flex items-center gap-2">
          <Info className="w-4 h-4 text-muted" />
          <span className="text-xs text-muted">This file is completely isolated.</span>
        </div>
      )}

      {nodeCycles.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 p-3 rounded-lg flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning" />
            <span className="text-xs font-bold text-warning uppercase tracking-wider">
              Involved in {nodeCycles.length} cycle{nodeCycles.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1 bg-panel p-2 rounded">
            {nodeCycles.map((cycle, i) => (
              <div
                key={i}
                className="text-[10px] text-muted leading-relaxed border-l-2 border-warning/40 pl-2 font-mono"
              >
                {cycle.map(f => f.split('/').pop()).join(' → ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {info.dependencies?.length > 0 && (
        <section className="bg-panel p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted uppercase tracking-wider text-[10px] font-bold">
              Imports ({info.dependencyCount})
            </p>
            <span className="text-[10px] text-accent font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent inline-block" /> Outgoing
            </span>
          </div>
          <div className="flex flex-col max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {info.dependencies.map((dep, i) => (
              <DepEntry key={i} dep={dep} repoId={repoId} onSelectNode={onSelectNode} />
            ))}
          </div>
        </section>
      )}

      {info.dependents.length > 0 && (
        <section className="bg-panel p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted uppercase tracking-wider text-[10px] font-bold">
              Imported by ({info.dependentCount})
            </p>
            <span className="text-[10px] text-green-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Incoming
            </span>
          </div>
          <div className="flex flex-col max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {info.dependents.map((dep, i) => (
              <DepEntry key={i} dep={dep} reverse repoId={repoId} onSelectNode={onSelectNode} />
            ))}
          </div>
        </section>
      )}

      {info.externalPackages?.length > 0 && (
        <section className="bg-panel p-3 rounded-lg border border-border">
          <p className="text-muted uppercase tracking-wider mb-2 text-[10px] font-bold">External packages</p>
          <div className="flex flex-col max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {info.externalPackages.map(pkg => (
              <div key={pkg} className="flex items-center gap-2 py-1 border-b border-text/5 last:border-0">
                <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-text text-xs font-mono truncate">{pkg}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function PackageDetailPanel({ nodeId, graph, onSelectNode }) {
  const node = graph?.nodes?.find(n => n.id === nodeId);
  if (!node) return null;

  if (node.type === 'moduleNode') {
    const users = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => graph.nodes.find(n => n.id === e.source)?.data?.filePath ?? e.source);

    return (
      <div className="flex flex-col gap-4">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <p className="text-muted uppercase tracking-wider mb-2 text-[10px] font-bold">External Module</p>
          <div className="flex items-center gap-2 bg-panel p-2.5 rounded border border-text/5">
            <Package className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-text font-mono break-all text-sm font-semibold">{node.data.label}</p>
          </div>
        </div>

        {users.length > 0 && (
          <section className="bg-panel p-3 rounded-lg border border-border">
            <p className="text-muted uppercase tracking-wider mb-2 text-[10px] font-bold">
              Imported by ({users.length})
            </p>
            <div className="flex flex-col max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {users.map((f, i) => {
                const targetId = f.startsWith('file:') ? f : `file:${f}`;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectNode && onSelectNode(targetId)}
                    className="flex items-center gap-2 py-1.5 border-b border-text/5 last:border-0 hover:bg-surface/50 rounded px-1 text-left w-full cursor-pointer transition-colors group"
                  >
                    <File className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-text text-xs font-mono truncate group-hover:text-accent transition-colors">
                      {f.split('/').pop()}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }
  return null;
}
