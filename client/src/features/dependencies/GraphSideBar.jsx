import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, GitBranch, ExternalLink, Package, File, Info } from 'lucide-react';

export function StatRow({ label, value, warn = false }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono ${warn && value > 0 ? 'text-warning' : 'text-white'}`}>{value}</span>
    </div>
  );
}

export function Chip({ label, color }) {
  const cls = color === 'accent' ? 'text-accent border-accent/30' : 'text-green-400 border-green-400/30';
  return <span className={`border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>;
}

export function DepEntry({ dep, repoId, reverse = false }) {
  const name  = dep.filePath ? dep.filePath.split('/').pop() : dep.package;
  const Icon  = dep.package ? Package : File;
  const color = dep.package ? 'text-amber-400' : 'text-accent';

  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <Icon className={`w-3 h-3 ${color} shrink-0`} />
      <span className="text-white font-mono truncate flex-1" title={dep.filePath || dep.package}>{name}</span>
      {dep.filePath && (
        <Link
          to={`/explore/${repoId}/source?path=${encodeURIComponent(dep.filePath)}`}
          className="opacity-0 group-hover:opacity-100 text-accent hover:underline shrink-0"
          title="View in Explorer"
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

export function FileDetailPanel({ info, repoId, graph }) {
  const nodeCycles = graph?.cycles?.filter(c => c.includes(info.id)) || [];
  const isIsolated = graph?.isolatedFiles?.includes(info.id);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-danger border-danger/30 bg-danger/10';
      case 'high': return 'text-warning border-warning/30 bg-warning/10';
      case 'warning': return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
      default: return 'text-success border-success/30 bg-success/10';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-muted uppercase tracking-wider mb-1">File</p>
        <p className="text-white font-mono whitespace-nowrap overflow-x-auto custom-scrollbar pb-1 mb-1 text-[11px]">{info.filePath}</p>
        <div className="flex gap-2">
          <Link
            to={`/explore/${repoId}/source?path=${encodeURIComponent(info.filePath)}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 border border-accent/40 rounded text-accent hover:bg-accent/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View Source
          </Link>
          {info.health && info.health.severity !== 'healthy' && (
            <Link
              to={`/explore/${repoId}/health?file=${encodeURIComponent(info.filePath)}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-surface/50 border border-border/50 rounded text-muted hover:text-white transition-colors"
            >
              <AlertCircle className="w-3 h-3" />
              View Risks
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label={`${info.dependencyCount} deps`} color="accent" />
        <Chip label={`${info.dependentCount} users`} color="success" />
        {info.health && (
          <span className={`border rounded px-1.5 py-0.5 text-[10px] font-medium capitalize flex items-center gap-1 ${getSeverityColor(info.health.severity)}`}>
            {info.health.severity !== 'healthy' ? <AlertCircle className="w-3 h-3" /> : <GitBranch className="w-3 h-3" />}
            {info.health.severity}
          </span>
        )}
      </div>

      {info.health?.hotspot && (
        <div className="bg-danger/10 border border-danger/30 p-2 rounded flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-danger">Engineering Hotspot</span>
            <span className="text-[10px] text-danger/80 leading-tight mt-0.5">
              This file requires immediate attention (Score: {info.health.hotspot.score})
            </span>
          </div>
        </div>
      )}

      {isIsolated && (
        <div className="bg-surface/50 border border-border/50 p-2 rounded flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-muted" />
          <span className="text-xs text-muted">This file is isolated (no connections)</span>
        </div>
      )}

      {nodeCycles.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 p-2 rounded flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-warning" />
            <span className="text-xs font-medium text-warning">Involved in {nodeCycles.length} cycle{nodeCycles.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
            {nodeCycles.map((cycle, i) => (
              <div key={i} className="text-[10px] text-muted leading-tight border-l-2 border-warning/30 pl-2">
                {cycle.map(f => f.split('/').pop()).join(' → ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {info.dependencies?.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">Imports ({info.dependencyCount})</p>
          {info.dependencies.map((dep, i) => <DepEntry key={i} dep={dep} repoId={repoId} />)}
        </section>
      )}

      {info.dependents.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">Imported by ({info.dependentCount})</p>
          {info.dependents.map((dep, i) => <DepEntry key={i} dep={dep} reverse repoId={repoId} />)}
        </section>
      )}

      {info.externalPackages?.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">External packages</p>
          {info.externalPackages.map(pkg => (
            <div key={pkg} className="flex items-center gap-1.5 py-0.5">
              <Package className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-white font-mono truncate">{pkg}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function PackageDetailPanel({ nodeId, graph }) {
  const node = graph?.nodes?.find(n => n.id === nodeId);
  if (!node) return null;

  if (node.type === 'package') {
    const users = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => graph.nodes.find(n => n.id === e.source)?.filePath ?? e.source);

    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-muted uppercase tracking-wider mb-1">Package</p>
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-white font-mono break-all">{node.name}</p>
          </div>
        </div>
        {users.length > 0 && (
          <section>
            <p className="text-muted uppercase tracking-wider mb-1.5">Imported by ({users.length})</p>
            {users.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <File className="w-3 h-3 text-accent shrink-0" />
                <span className="text-white font-mono truncate">{f.split('/').pop()}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }
  return null;
}