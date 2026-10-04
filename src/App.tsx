/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell, type ChannelHealthMap } from './components/shell/AppShell';
import { LoginPage } from './components/auth/LoginPage';
import { ConnectedAccounts } from './components/accounts/ConnectedAccounts';
import { OverviewPage } from './pages/OverviewPage';
import { LeadsPage } from './pages/LeadsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { HumanTasksPage } from './pages/HumanTasksPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AutomationPage } from './pages/AutomationPage';
import { ChannelPage } from './pages/ChannelPage';
import { SettingsPage } from './pages/SettingsPage';
import { LearningsManager } from './components/learnings/LearningsManager';
import { ImportManager } from './components/imports/ImportManager';
import { AgentControlPanel } from './components/agent/AgentControlPanel';
import { api } from './lib/api';
import { SessionUser, ConnectionsResponse, ConnectedPlatform } from './types';

/**
 * Application shell.
 *
 * Two top-level states, matching the product's required flow:
 *   1. Not signed in -> LoginPage (Create account on first visit)
 *   2. Signed in     -> Dashboard, with Connected Accounts as the first tab
 *
 * The old implementation used window.prompt() for the operator password, which
 * is not a normal SaaS experience. That is gone.
 */
/**
 * APPLICATION ROOT
 * ============================================================================
 * Three states, in order:
 *   1. checking  -> neutral blank (no login flash, no data fetch)
 *   2. signed out-> LoginPage
 *   3. signed in -> AppShell, which owns navigation and renders one page
 *
 * Connections are loaded ONCE here and shared with every page, so the sidebar
 * dots and the channel pages can never disagree with each other.
 */

export default function App() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [connections, setConnections] = useState<ConnectionsResponse | null>(null);
  const [connectMessage, setConnectMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [counts, setCounts] = useState({ humanTasks: 0, followUps: 0 });

  /** Connections back the sidebar dots and the Connected Accounts page. */
  const loadConnections = useCallback(async () => {
    try {
      setConnections(await api.getConnections());
    } catch {
      // A failure here must not break the app; pages show their own errors.
      setConnections(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);
    const outcome = params.get('connect');
    const message = params.get('message');
    if (outcome && message) {
      setConnectMessage({ text: message, ok: outcome === 'success' });
      // Clean the URL so a refresh does not re-show a stale result.
      window.history.replaceState({}, '', window.location.pathname);
    }

    api
      .getAuthSession()
      .then((session) => setSessionUser(session.user))
      .catch(() => setSessionUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    loadConnections();
    // Sidebar badge counts, refreshed on navigation.
    api
      .getOverview()
      .then((o) => setCounts({ humanTasks: o.cards.humanRequired, followUps: o.cards.followUpsDue }))
      .catch(() => undefined);
  }, [sessionUser, activeTab, loadConnections]);

  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setSessionUser(null);
    setConnections(null);
    setActiveTab('overview');
  }, []);

  // Derived channel health for the sidebar dots.
  const channelHealth = useMemo<ChannelHealthMap>(() => {
    const map: ChannelHealthMap = {};
    for (const account of connections?.accounts ?? []) {
      map[account.platform] = {
        connected: account.connected,
        attention: account.status === 'ERROR',
        needsSetup: !account.available,
      };
    }
    return map;
  }, [connections]);

  if (!authChecked) return <div className="min-h-screen bg-canvas" />;

  if (!sessionUser) {
    return (
      <LoginPage
        onAuthenticated={() => {
          setAuthChecked(true);
          api
            .getAuthSession()
            .then((session) => setSessionUser(session.user))
            .catch(() => setSessionUser(null));
        }}
      />
    );
  }

  const navigate = (tab: string) => setActiveTab(tab);
  const isOwner = sessionUser.role === 'OWNER';

  return (
    <AppShell
      activeTab={activeTab}
      onNavigate={navigate}
      userName={sessionUser.name || sessionUser.email}
      isOwner={isOwner}
      onLogout={handleLogout}
      channelHealth={channelHealth}
      humanTaskCount={counts.humanTasks}
      followUpCount={counts.followUps}
    >
      {activeTab === 'overview' && <OverviewPage connections={connections} onNavigate={navigate} />}
      {activeTab === 'leads' && <LeadsPage onNavigate={navigate} />}
      {activeTab === 'conversations' && <ConversationsPage />}
      {activeTab === 'follow-ups' && <FollowUpsPage />}
      {activeTab === 'human-tasks' && <HumanTasksPage />}
      {activeTab === 'learning' && <LearningsManager />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'automation' && <AutomationPage />}
      {activeTab === 'connections' && (
        <div className="p-6 lg:p-8 max-w-[1400px]">
          <ConnectedAccounts initialMessage={connectMessage?.text ?? null} initialSuccess={connectMessage?.ok ?? null} />
        </div>
      )}
      {activeTab.startsWith('channel:') && (
        <ChannelPage
          platform={activeTab.split(':')[1] as ConnectedPlatform}
          connections={connections}
          onRefreshConnections={loadConnections}
          onManage={() => navigate('connections')}
        />
      )}
      {activeTab === 'settings' && (
        <SettingsPage user={sessionUser} isOwner={isOwner} onManageConnections={() => navigate('connections')} />
      )}
      {/* Legacy deep links kept working from earlier sessions and bookmarks. */}
      {activeTab === 'dashboard' && <OverviewPage connections={connections} onNavigate={navigate} />}
      {activeTab === 'imports' && <ImportManager onImportCompleted={() => navigate('overview')} />}
      {activeTab === 'agent' && <AgentControlPanel isOwner={isOwner} />}
    </AppShell>
  );
}
