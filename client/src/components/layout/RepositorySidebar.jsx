import { NavLink, useParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileCode2, 
  Box, 
  GitMerge, 
  BookOpen, 
  ShieldAlert, 
  Wrench, 
  Activity, 
  Bot
} from 'lucide-react';
import clsx from 'clsx';

const NAV_GROUPS = [
  {
    title: 'Repository',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: '' },
      { id: 'source', label: 'Source Explorer', icon: FileCode2, to: 'source' },
      { id: 'architecture', label: 'Architecture', icon: Box, to: 'architecture' },
      { id: 'graph', label: 'Dependencies', icon: GitMerge, to: 'graph' },
      { id: 'documentation', label: 'Documentation', icon: BookOpen, to: 'documentation' },
    ]
  },
  {
    title: 'Engineering',
    items: [
      { id: 'health', label: 'Health', icon: ShieldAlert, to: 'health' },
      { id: 'refactoring', label: 'Refactoring', icon: Wrench, to: 'refactoring' },
      { id: 'impact', label: 'Change Impact', icon: Activity, to: 'impact' },
    ]
  },
  {
    title: 'AI',
    items: [
      { id: 'assistant', label: 'Repository Assistant', icon: Bot, to: 'assistant' },
    ]
  }
];

export default function RepositorySidebar() {
  const { repoId } = useParams();

  return (
    <aside className="w-64 border-r border-border bg-panel shrink-0 flex flex-col h-full overflow-hidden">
      <div className="h-12 flex items-center px-4 border-b border-border shrink-0">
        <span className="font-bold text-white tracking-tight flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center">
            <span className="text-white text-xs font-bold leading-none">C</span>
          </div>
          CodeLens
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-6">
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-2">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={`/explore/${repoId}/${item.to}`}
                    end={item.to === ''}
                    className={({ isActive }) => clsx(
                      "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors group",
                      isActive 
                        ? "bg-accent/10 text-accent font-medium" 
                        : "text-muted hover:bg-surface hover:text-white"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={clsx("w-4 h-4 shrink-0 transition-colors", isActive ? "text-accent" : "text-muted group-hover:text-white")} />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
