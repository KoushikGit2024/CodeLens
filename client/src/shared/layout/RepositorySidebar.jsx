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
  UploadCloud,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Logo } from '../components/Logo';
import clsx from 'clsx';

const NAV_GROUPS = [
  {
    id: 'repo',
    title: 'Repository',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: '' },
      { id: 'source', label: 'Files', icon: FileCode2, to: 'source' },
      { id: 'architecture', label: 'Architecture', icon: Box, to: 'architecture' },
      { id: 'graph', label: 'Dependencies', icon: GitMerge, to: 'graph' },
    ]
  },
  {
    id: 'engineering',
    title: 'Engineering',
    items: [
      { id: 'health', label: 'Security & Health', icon: ShieldAlert, to: 'health' },
      { id: 'refactoring', label: 'Refactoring', icon: Wrench, to: 'refactoring' },
      { id: 'impact', label: 'Impact Analysis', icon: Activity, to: 'impact' },
    ]
  },
  {
    id: 'ai',
    title: 'AI',
    items: [
      { id: 'assistant', label: 'AI Assistant', icon: Bot, to: 'assistant' },
    ]
  }
];

export default function RepositorySidebar() {
  const { repoId } = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <aside className={`flex flex-col h-full overflow-hidden bg-panel border-r border-border transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-64'}`}>
      
      {/* Header */}
      <div className={clsx("h-12 flex items-center shrink-0 border-b border-border transition-all", collapsed ? "justify-center px-0" : "justify-between px-4")}>
        {!collapsed ? (
          <>
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <Logo className="w-5 h-5" textClass="text-[16px]" showText={true} />
            </Link>
            <button 
              onClick={() => setCollapsed(true)} 
              className="p-1.5 text-muted hover:text-white hover:bg-surface rounded transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        ) : (
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Logo className="w-6 h-6" showText={false} />
          </Link>
        )}
      </div>

      {/* Top Collapse Button for Collapsed State */}
      {collapsed && (
        <div className="flex justify-center pt-3 pb-1">
          <button 
            onClick={() => setCollapsed(false)} 
            className="p-2 text-muted hover:text-white hover:bg-surface rounded transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftClose className="w-5 h-5 rotate-180" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-2 pt-2' : 'p-3 pt-4'} custom-scrollbar space-y-5`}>
        {NAV_GROUPS.map((group) => {
          const isGroupCollapsed = collapsedGroups[group.id];
          return (
            <div key={group.id} className="flex flex-col">
              {!collapsed && (
                <button 
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center justify-between w-full text-left px-2 mb-1.5 text-muted hover:text-white transition-colors group/header"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider">{group.title}</span>
                  {isGroupCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/header:opacity-100 transition-opacity" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover/header:opacity-100 transition-opacity" />
                  )}
                </button>
              )}
              
              <div className={`space-y-0.5 ${collapsed ? 'flex flex-col items-center' : ''} ${isGroupCollapsed && !collapsed ? 'hidden' : 'block'}`}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.id}
                      to={`/explore/${repoId}/${item.to}`}
                      end={item.to === ''}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) => clsx(
                        "flex items-center rounded text-[13px] transition-all duration-200 group relative overflow-hidden",
                        collapsed ? "justify-center w-10 h-10 mb-1" : "gap-3 px-2.5 py-1.5 w-full",
                        isActive 
                          ? "bg-accent/10 text-white font-medium" 
                          : "text-muted hover:bg-surface hover:text-white"
                      )}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={clsx("shrink-0 transition-all duration-300", isActive ? 'text-accent' : 'text-muted group-hover:text-white')}>
                            <Icon className={collapsed ? "w-5 h-5" : "w-[18px] h-[18px]"} />
                          </span>
                          {!collapsed && <span className="truncate" title={item.label}>{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className={`p-3 border-t border-border mt-auto flex flex-col gap-1 ${collapsed ? 'px-2 items-center' : ''}`}>
        <NavLink
          to="/"
          title={collapsed ? "Upload New Repository" : undefined}
          className={({ isActive }) => clsx(
            "flex items-center rounded text-[13px] transition-all duration-200 group min-w-0",
            collapsed ? "justify-center w-10 h-10" : "gap-3 px-2.5 py-2 w-full",
            isActive 
              ? "bg-accent/10 text-white font-medium" 
              : "text-muted hover:bg-surface hover:text-white"
          )}
        >
          {({ isActive }) => (
            <>
              <UploadCloud className={clsx(collapsed ? "w-5 h-5" : "w-[18px] h-[18px] shrink-0", "transition-all duration-300", isActive ? "text-accent" : "text-muted group-hover:text-white")} />
              {!collapsed && <span className="truncate" title="Upload New Repo">Upload New Repo</span>}
            </>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
