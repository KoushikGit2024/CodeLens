import { useState, useEffect } from 'react';
import { Link, NavLink, useParams, useSearchParams, useLocation } from 'react-router-dom';
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
  ChevronRight,
  User,
  LogIn,
  FolderTree,
  Bookmark,
  GitCommit,
  Info,
  Brain,
  X
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const NAV_GROUPS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: '' },
      { id: 'assistant', label: 'AI Assistant', icon: Bot, to: 'assistant' },
    ]
  },
  {
    id: 'exploration',
    title: 'Exploration',
    items: [
      { id: 'source', label: 'Source Explorer', icon: FileCode2, to: 'source' },
      { id: 'tree', label: 'File Tree', icon: FolderTree, to: 'tree' },
      { id: 'bookmarks', label: 'Bookmarks & Notes', icon: Bookmark, to: 'bookmarks' },
    ]
  },
  {
    id: 'system_maps',
    title: 'System Maps',
    items: [
      { id: 'architecture', label: 'Architecture', icon: Box, to: 'architecture' },
      { id: 'dependencies', label: 'Dependencies', icon: GitMerge, to: 'dependencies' },
      // { id: 'git', label: 'Git History', icon: GitCommit, to: 'git' },
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
    id: 'pro_features',
    title: 'Advanced',
    items: [
      { id: 'semantic', label: 'Semantic Search', icon: Brain, to: 'semantic', isPro: true },
    ]
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { id: 'about', label: 'About CodeLens', icon: Info, to: 'about' },
    ]
  }
];

export default function RepositorySidebar() {
  const { repoId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  
  const collapsed = searchParams.get('sidebar') === 'closed';
  const isMobileOpen = searchParams.get('mobileNav') === 'open';

  const setCollapsed = (isClosed) => {
    setSearchParams(prev => {
      if (isClosed) prev.set('sidebar', 'closed');
      else prev.delete('sidebar');
      return prev;
    }, { replace: true });
  };

  const closeMobileNav = () => {
    if (isMobileOpen) {
      setSearchParams(prev => {
        prev.delete('mobileNav');
        return prev;
      }, { replace: true });
    }
  };

  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 640 : true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveCollapsed = collapsed && isDesktop;

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <aside className={clsx(
      "flex flex-col h-full overflow-hidden bg-panel border-r border-border transition-transform duration-300 z-[100]",
      // Desktop: relative width
      "sm:relative sm:translate-x-0",
      effectiveCollapsed ? "sm:w-[68px]" : "sm:w-64",
      // Mobile: absolute offscreen or onscreen
      "absolute inset-y-0 left-0 w-64",
      isMobileOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      
      {/* Header */}
      <div className={clsx("h-12 flex items-center shrink-0 border-b border-border transition-all", effectiveCollapsed ? "justify-center px-0" : "justify-between px-4")}>
        {!effectiveCollapsed ? (
          <>
            <Link to={`/${effectiveCollapsed ? '?sidebar=closed' : ''}`} className="flex items-center hover:opacity-80 transition-opacity">
              <Logo className="w-5 h-5" textClass="text-[16px]" showText={true} />
            </Link>
            <button 
              onClick={() => setCollapsed(true)} 
              className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors hidden sm:block"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <button 
              onClick={closeMobileNav}
              className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors sm:hidden"
              title="Close Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <Link to={`/${collapsed ? '?sidebar=closed' : ''}`} className="flex items-center hover:opacity-80 transition-opacity">
            <Logo className="w-6 h-6" showText={false} />
          </Link>
        )}
      </div>

      {/* Top Collapse Button for Collapsed State */}
      {effectiveCollapsed && (
        <div className="flex justify-center pt-3 pb-1">
          <button 
            onClick={() => setCollapsed(false)} 
            className="p-2 text-muted hover:text-text hover:bg-surface rounded transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftClose className="w-5 h-5 rotate-180" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${effectiveCollapsed ? 'px-2 pt-2' : 'p-3 pt-4'} custom-scrollbar space-y-5`}>
        {NAV_GROUPS.map((group) => {
          const isGroupCollapsed = collapsedGroups[group.id];
          return (
            <div key={group.id} className="flex flex-col">
              {!effectiveCollapsed && (
                <button 
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center justify-between w-full text-left px-2 mb-1.5 text-muted hover:text-text transition-colors group/header"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider">{group.title}</span>
                  {isGroupCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/header:opacity-100 transition-opacity" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover/header:opacity-100 transition-opacity" />
                  )}
                </button>
              )}
              
              <div className={`space-y-0.5 ${effectiveCollapsed ? 'flex flex-col items-center' : ''} ${isGroupCollapsed && !effectiveCollapsed ? 'hidden' : 'block'}`}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.id}
                      to={`/explore/${repoId}/${item.to}${effectiveCollapsed ? '?sidebar=closed' : ''}`}
                      end={item.to === ''}
                      onClick={closeMobileNav}
                      title={effectiveCollapsed ? item.label : undefined}
                      className={({ isActive }) => clsx(
                        "flex items-center rounded-r text-[13px] transition-all duration-200 group relative overflow-hidden border-l-2",
                        effectiveCollapsed ? "justify-center w-10 h-10 mb-1" : "gap-3 px-2.5 py-1.5 w-full",
                        isActive 
                          ? "border-accent text-text font-medium bg-accent/[0.07]" 
                          : "border-transparent text-muted hover:bg-text/[0.04] hover:text-text"
                      )}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={clsx("shrink-0 transition-all duration-300", isActive ? 'text-accent' : 'text-muted group-hover:text-text')}>
                            <Icon className={effectiveCollapsed ? "w-5 h-5" : "w-[18px] h-[18px]"} />
                          </span>
                          {!effectiveCollapsed && (
                            <div className="flex items-center justify-between w-full truncate">
                              <span className="truncate" title={item.label}>{item.label}</span>
                              {item.isPro && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-accent/20 text-accent rounded flex items-center uppercase tracking-wider ml-2">
                                  Pro
                                </span>
                              )}
                            </div>
                          )}
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
      <div className={`p-3 border-t border-border mt-auto flex flex-col gap-1 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] ${effectiveCollapsed ? 'px-2 items-center' : ''}`}>
        <NavLink
          to="/"
          title={effectiveCollapsed ? "Upload New Repository" : undefined}
          className={({ isActive }) => clsx(
            "flex items-center rounded-r text-[13px] transition-all duration-200 group min-w-0 border-l-2",
            effectiveCollapsed ? "justify-center w-10 h-10" : "gap-3 px-2.5 py-2 w-full",
            isActive 
              ? "border-accent text-text font-medium bg-accent/[0.07]" 
              : "border-transparent text-muted hover:bg-text/[0.04] hover:text-text"
          )}
        >
          {({ isActive }) => (
            <>
              <UploadCloud className={clsx(effectiveCollapsed ? "w-5 h-5" : "w-[18px] h-[18px] shrink-0", "transition-all duration-300", isActive ? "text-accent" : "text-muted group-hover:text-text")} />
              {!effectiveCollapsed && <span className="truncate" title="Upload New Repo">Upload New Repo</span>}
            </>
          )}
        </NavLink>
        
        {/* User Account / Auth Section */}
        {user ? (
          <NavLink
            to="/account"
            title={effectiveCollapsed ? "Account Settings" : undefined}
            className={({ isActive }) => clsx(
              "flex items-center rounded-r text-[13px] transition-all duration-200 group min-w-0 border-l-2 mt-2",
              effectiveCollapsed ? "justify-center w-10 h-10" : "gap-3 px-2.5 py-2 w-full",
              isActive 
                ? "border-accent text-text font-medium bg-accent/[0.07]" 
                : "border-transparent text-muted hover:bg-text/[0.04] hover:text-text"
            )}
          >
            {({ isActive }) => (
              <>
                <div className={clsx(
                  "flex items-center justify-center rounded-full shrink-0 border border-border transition-all duration-300",
                  effectiveCollapsed ? "w-6 h-6" : "w-[22px] h-[22px]",
                  isActive ? "bg-accent/20 border-accent/50" : "bg-surface group-hover:border-muted"
                )}>
                  <User className={clsx("w-3.5 h-3.5", isActive ? "text-accent" : "text-muted group-hover:text-text")} />
                </div>
                {!effectiveCollapsed && <span className="truncate" title={user.user_metadata?.full_name || 'Account'}>{user.user_metadata?.full_name || user.email || 'Account'}</span>}
              </>
            )}
          </NavLink>
        ) : (
          // <NavLink
          //   to="/auth/signin"
          //7   title={collapsed ? "Sign In" : undefined}
          //   className={({ isActive }) => clsx(
          //     "flex items-center rounded-r text-[13px] transition-all duration-200 group min-w-0 border-l-2 mt-2",
          //     collapsed ? "justify-center w-10 h-10" : "gap-3 px-2.5 py-2 w-full",
          //     isActive 
          //       ? "border-accent text-text font-medium bg-accent/[0.07]" 
          //       : "border-transparent text-muted hover:bg-text/[0.04] hover:text-text"
          //   )}
          // >
          //   {({ isActive }) => (
          //     <>
          //       <LogIn className={clsx(collapsed ? "w-5 h-5" : "w-[18px] h-[18px] shrink-0", "transition-all duration-300", isActive ? "text-accent" : "text-muted group-hover:text-text")} />
          //       {!collapsed && <span className="truncate" title="Sign In">Sign In</span>}
          //     </>
          //   )}
          // </NavLink>
          <></>
        )}
      </div>
    </aside>
  );
}
