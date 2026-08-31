import { useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileCode2, 
  Box, 
  GitMerge, 
  BookOpen, 
  ShieldAlert, 
  Wrench, 
  Activity, 
  Bot,
  PanelLeftClose,
  UploadCloud
} from 'lucide-react';
import { Logo } from '../components/Logo';
import clsx from 'clsx';

const NAV_GROUPS = [
  {
    title: 'Repository',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: '' },
      { id: 'source', label: 'Files', icon: FileCode2, to: 'source' },
      { id: 'architecture', label: 'Architecture', icon: Box, to: 'architecture' },
      { id: 'graph', label: 'Dependencies', icon: GitMerge, to: 'graph' },
      { id: 'documentation', label: 'Documentation', icon: BookOpen, to: 'documentation' },
    ]
  },
  {
    title: 'Engineering',
    items: [
      { id: 'health', label: 'Security & Health', icon: ShieldAlert, to: 'health' },
      { id: 'refactoring', label: 'Refactoring', icon: Wrench, to: 'refactoring' },
      { id: 'impact', label: 'Impact Analysis', icon: Activity, to: 'impact' },
    ]
  },
  {
    title: 'AI',
    items: [
      { id: 'assistant', label: 'AI Assistant', icon: Bot, to: 'assistant' },
    ]
  }
];

export default function RepositorySidebar() {
  const { repoId } = useParams();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`flex flex-col h-full overflow-hidden bg-panel border-r border-border transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className={clsx("h-12 flex items-center shrink-0 border-b border-border transition-all", collapsed ? "justify-center px-0" : "justify-center px-4")}>
        {!collapsed ? (
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity w-full">
            <Logo className="w-5 h-5" textClass="text-[16px]" showText={true} />
          </Link>
        ) : (
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Logo className="w-6 h-6" showText={false} />
          </Link>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'p-3'} custom-scrollbar space-y-6 mt-2`}>
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            {!collapsed && (
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-2">
                {group.title}
              </p>
            )}
            <div className={`space-y-0.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={`/explore/${repoId}/${item.to}`}
                    end={item.to === ''}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => clsx(
                      "flex items-center rounded text-sm transition-colors group",
                      collapsed ? "justify-center p-2" : "gap-2.5 px-2 py-1.5 w-full",
                      isActive 
                        ? "bg-accent/10 text-accent font-medium" 
                        : "text-muted hover:bg-surface hover:text-white"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-accent' : 'text-muted group-hover:text-white'}`}>
                          <Icon className="w-full h-full" />
                        </span>
                        {!collapsed && <span className="truncate" title={item.label}>{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`p-3 border-t border-border mt-auto flex flex-col gap-1 ${collapsed ? 'px-2 items-center' : ''}`}>
        <NavLink
          to="/"
          title={collapsed ? "Upload New Repository" : undefined}
          className={({ isActive }) => clsx(
            "flex items-center rounded text-sm transition-colors group min-w-0",
            collapsed ? "justify-center p-2" : "gap-2.5 px-2 py-2 w-full",
            isActive 
              ? "bg-accent/10 text-accent font-medium" 
              : "text-muted hover:bg-surface hover:text-white"
          )}
        >
          {({ isActive }) => (
            <>
              <UploadCloud className={clsx(collapsed ? "w-5 h-5" : "w-4 h-4 shrink-0", "transition-colors", isActive ? "text-accent" : "text-muted group-hover:text-white")} />
              {!collapsed && <span className="truncate" title="Upload New Repo">Upload New Repo</span>}
            </>
          )}
        </NavLink>

        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className={clsx(
            "flex items-center rounded text-sm transition-colors group min-w-0",
            collapsed ? "justify-center p-2 text-muted hover:bg-surface hover:text-white" : "gap-2.5 px-2 py-2 w-full text-muted hover:bg-surface hover:text-white"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeftClose className={clsx(collapsed ? "w-5 h-5 rotate-180" : "w-4 h-4 shrink-0", "transition-transform group-hover:text-white text-muted")} />
          {!collapsed && <span className="truncate" title="Collapse Sidebar">Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
