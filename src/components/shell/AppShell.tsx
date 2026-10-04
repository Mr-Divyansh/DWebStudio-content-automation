/**
 * CONTROL CENTER APP SHELL
 * ============================================================================
 * Two-column layout: a collapsible, grouped sidebar and a scrollable content
 * area. Each channel row carries a live connection dot so the operator can see
 * which platforms are live without opening a page.
 *
 * Collapse state is persisted to localStorage. This is UI preference only — no
 * credential or account data is ever stored there.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  MessagesSquare,
  CalendarClock,
  UserCheck,
  BrainCircuit,
  BarChart3,
  Plug,
  Settings,
  Bot,
  ChevronLeft,
  Instagram,
  MessageCircle,
  Mail,
  Hash,
  Send,
  LogOut,
  Menu,
} from 'lucide-react';
import type { ConnectedPlatform } from '../../types';

export const CHANNEL_ICONS: Record<ConnectedPlatform, React.ElementType> = {
  INSTAGRAM: Instagram,
  WHATSAPP: MessageCircle,
  GMAIL: Mail,
  DISCORD: Hash,
  TELEGRAM: Send,
};

/** Sidebar order mirrors the product's priority order. */
export const CHANNEL_ORDER: ConnectedPlatform[] = ['INSTAGRAM', 'WHATSAPP', 'GMAIL', 'DISCORD', 'TELEGRAM'];

export interface ChannelHealth {
  connected: boolean;
  /** Provider needs the operator's attention (ERROR state). */
  attention: boolean;
  /** One-time administrator setup has not been done yet. */
  needsSetup: boolean;
}

export type ChannelHealthMap = Partial<Record<ConnectedPlatform, ChannelHealth>>;

interface ShellContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue>({
  collapsed: false,
  toggleCollapsed: () => undefined,
  mobileOpen: false,
  setMobileOpen: () => undefined,
});

export const useShell = () => useContext(ShellContext);

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const STORAGE_KEY = 'dws.sidebar.collapsed';

interface AppShellProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  userName: string;
  isOwner: boolean;
  onLogout: () => void;
  channelHealth: ChannelHealthMap;
  /** Leads needing a human — surfaces as a sidebar badge. */
  humanTaskCount: number;
  followUpCount: number;
  children: React.ReactNode;
}
export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onNavigate,
  userName,
  isOwner,
  onLogout,
  channelHealth,
  humanTaskCount,
  followUpCount,
  children,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable — collapse simply will not persist */
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const navigate = useCallback(
    (tab: string) => {
      onNavigate(tab);
      setMobileOpen(false);
    },
    [onNavigate],
  );

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  const groups: NavGroup[] = [
    { title: 'Overview', items: [{ id: 'overview', label: 'Command Center', icon: LayoutDashboard }] },
    {
      title: 'Lead AI',
      items: [
        { id: 'leads', label: 'Leads', icon: Users },
        { id: 'conversations', label: 'Conversations', icon: MessagesSquare },
        { id: 'follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: followUpCount },
        { id: 'human-tasks', label: 'Human Tasks', icon: UserCheck, badge: humanTaskCount },
        { id: 'learning', label: 'Learning', icon: BrainCircuit },
      ],
    },
    {
      title: 'Channels',
      items: CHANNEL_ORDER.map((platform) => ({
        id: `channel:${platform}`,
        label: platform.charAt(0) + platform.slice(1).toLowerCase(),
        icon: CHANNEL_ICONS[platform],
      })),
    },
    {
      title: 'Insight',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'automation', label: 'Automation', icon: Bot },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { id: 'connections', label: 'Connected Accounts', icon: Plug },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];
const sidebar = (
    <nav className="flex h-full flex-col border-r border-line bg-surface">
      {/* Brand */}
      <div className={`flex items-center gap-2.5 border-b border-line ${collapsed ? 'justify-center px-3 py-4' : 'px-4 py-4'}`}>
        <div className="w-8 h-8 shrink-0 rounded-lg bg-accent flex items-center justify-center font-bold text-white text-sm">
          D
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight leading-tight truncate">D Web Studio</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Lead AI</p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto hidden lg:grid h-6 w-6 place-items-center rounded-md text-ink-faint hover:bg-raised hover:text-ink transition-colors"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto cc-scroll py-3">
        {groups.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            {!collapsed && <p className="cc-label px-4 pb-1.5">{group.title}</p>}
            {collapsed && <div className="mx-4 my-2 border-t border-line" />}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active = activeTab === item.id;
                const Icon = item.icon;
                // Channel rows carry a live connection dot.
                const isChannel = item.id.startsWith('channel:');
                const platform = isChannel ? (item.id.split(':')[1] as ConnectedPlatform) : null;
                const health = platform ? channelHealth[platform] : undefined;
                const dot = !health
                  ? null
                  : health.connected
                    ? 'bg-ok'
                    : health.attention
                      ? 'bg-danger'
                      : health.needsSetup
                        ? 'bg-warn'
                        : 'bg-ink-faint';

                return (
                  <li key={item.id} className="relative">
                    <button
                      onClick={() => navigate(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        collapsed ? 'justify-center' : ''
                      } ${active ? 'bg-raised text-ink font-semibold' : 'text-ink-muted hover:bg-raised hover:text-ink'}`}
                    >
                      {active && <span className="absolute -left-2 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" aria-hidden="true" />}
                      <span className="relative shrink-0">
                        <Icon className={`h-4 w-4 ${active ? 'text-accent' : ''}`} />
                        {dot && (
                          <span
                            className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ${dot}`}
                            title={health?.connected ? 'Connected' : health?.attention ? 'Needs attention' : health?.needsSetup ? 'Setup required' : 'Not connected'}
                          />
                        )}
                      </span>
                      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                      {!collapsed && !!item.badge && item.badge > 0 && (
                        <span className="tabular shrink-0 rounded-full bg-accent-dim px-1.5 py-0.5 text-[10px] font-bold text-accent-soft">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
{/* User */}
      <div className="border-t border-line p-2">
        <div className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-overlay text-[11px] font-bold text-ink-muted">
            {userName.trim().charAt(0).toUpperCase() || '?'}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{userName}</p>
                <p className="truncate text-[10px] text-ink-faint">{isOwner ? 'Administrator' : 'Member'}</p>
              </div>
              <button
                onClick={onLogout}
                aria-label="Sign out"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-raised hover:text-ink transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <ShellContext.Provider value={value}>
      <div className="flex h-screen overflow-hidden bg-canvas text-ink">
        {/* Desktop sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[248px]'}`}>
          {sidebar}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[248px] shadow-2xl">{sidebar}</aside>
          </div>
        )}

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-muted"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold">D Web Studio · Lead AI</span>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto cc-scroll">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  );
};