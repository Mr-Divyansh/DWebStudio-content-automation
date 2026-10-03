/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginPage } from './components/auth/LoginPage';
import { ConnectedAccounts } from './components/accounts/ConnectedAccounts';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { LeadTable } from './components/leads/LeadTable';
import { LeadDetailModal } from './components/leads/LeadDetailModal';
import { ImportManager } from './components/imports/ImportManager';
import { LearningsManager } from './components/learnings/LearningsManager';
import { PortfolioManager } from './components/portfolio/PortfolioManager';
import { AgentControlPanel } from './components/agent/AgentControlPanel';
import { MessagingSettingsPanel } from './components/agent/MessagingSettingsPanel';
import { api } from './lib/api';
import {
  LeadItem,
  DashboardStats,
  PortfolioProjectItem,
  ConfigInfo,
  SessionUser,
} from './types';

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
export default function App() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [connectMessage, setConnectMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Data state
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioProjectItem[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);

  // Leads Hub filter states
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [intentFilter, setIntentFilter] = useState<string>('ALL');
  const [nicheFilter, setNicheFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [followUpOnly, setFollowUpOnly] = useState<boolean>(false);

  /**
   * Resolves the signed-in user once on mount, and reads the OAuth return
   * parameters (?tab=connections&connect=success|error&message=...) so the
   * Connected Accounts screen can report the real outcome.
   */
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

  const loadAllData = useCallback(async () => {
    try {
      setIsRefreshing(true);

      const [cfg, dash, pList, leadsRes] = await Promise.all([
        api.getConfig(),
        api.getDashboard(),
        api.getPortfolio(),
        api.getLeads({
          status: statusFilter,
          intent: intentFilter,
          niche: nicheFilter,
          source: sourceFilter,
          search: searchQuery,
          followUpOnly,
        }),
      ]);

      setConfig(cfg);
      setDashboardStats(dash);
      setPortfolio(pList);
      setLeads(leadsRes.leads);

      // If a lead is currently selected, refresh its details too
      if (selectedLead) {
        const refreshed = await api.getLeadById(selectedLead.id).catch(() => null);
        if (refreshed) setSelectedLead(refreshed);
      }
    } catch (err) {
      console.error('Error loading application data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [statusFilter, intentFilter, nicheFilter, sourceFilter, searchQuery, followUpOnly, selectedLead?.id]);

  useEffect(() => {
    // Only load dashboard data once signed in — the API requires a session.
    if (sessionUser) loadAllData();
  }, [statusFilter, intentFilter, nicheFilter, sourceFilter, searchQuery, followUpOnly, sessionUser]);

  const handleSelectLeadById = async (id: string) => {
    try {
      const fullLead = await api.getLeadById(id);
      setSelectedLead(fullLead);
    } catch (err) {
      console.error('Failed to load lead:', err);
    }
  };

  const handleNavigateToLeads = (filter?: { followUpOnly?: boolean }) => {
    if (filter?.followUpOnly !== undefined) {
      setFollowUpOnly(filter.followUpOnly);
    }
    setActiveTab('leads');
  };

  /** Signs out and returns to the login screen. */
  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setSessionUser(null);
    setActiveTab('dashboard');
  }, []);

  // Gate 1: still checking -> neutral loading screen (no data, no flash of login).
  if (!authChecked) {
    return <div className="min-h-screen bg-[#0C0F13]" />;
  }

  // Gate 2: not signed in -> the normal login / create-account screen.
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

  return (
    <div className="flex min-h-screen bg-[#0C0F13] text-[#F4F1EA] selection:bg-[#2F7EF2] selection:text-white">
      {/* Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        geminiConfigured={config?.geminiConfigured ?? false}
        followUpCount={dashboardStats?.followUps ?? 0}
        userName={sessionUser.name || sessionUser.email}
        isOwner={sessionUser.role === 'OWNER'}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          searchQuery={searchQuery}
          setSearchQuery={(q) => {
            setSearchQuery(q);
            if (activeTab !== 'leads') setActiveTab('leads');
          }}
          onOpenImport={() => setActiveTab('imports')}
          onRefresh={loadAllData}
          isRefreshing={isRefreshing}
        />

        <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* TAB 0: CONNECTED ACCOUNTS — the first stop after login */}
          {activeTab === 'connections' && (
            <ConnectedAccounts
              initialMessage={connectMessage?.text ?? null}
              initialSuccess={connectMessage?.ok ?? null}
            />
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && dashboardStats && (
            <DashboardOverview
              stats={dashboardStats}
              onSelectLead={handleSelectLeadById}
              onNavigateToLeads={handleNavigateToLeads}
              onOpenImport={() => setActiveTab('imports')}
              onOpenAgent={() => setActiveTab('agent')}
              isOwner={sessionUser.role === 'OWNER'}
            />
          )}

          {/* TAB 2: LEADS HUB */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-[#F4F1EA]">Lead Intelligence Hub</h2>
                <p className="text-xs text-[#8C98A9] mt-0.5">
                  Unified multi-source pipeline with buying intent, strict claim evidence, and human outreach approval.
                </p>
              </div>

              <LeadTable
                leads={leads}
                onSelectLead={setSelectedLead}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                intentFilter={intentFilter}
                setIntentFilter={setIntentFilter}
                nicheFilter={nicheFilter}
                setNicheFilter={setNicheFilter}
                sourceFilter={sourceFilter}
                setSourceFilter={setSourceFilter}
                followUpOnly={followUpOnly}
                setFollowUpOnly={setFollowUpOnly}
                isLoading={isRefreshing}
              />
            </div>
          )}

          {/* TAB 3: DATA IMPORTS */}
          {activeTab === 'imports' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-[#F4F1EA]">Conversation Import Pipelines</h2>
                <p className="text-xs text-[#8C98A9] mt-0.5">
                  Import official Instagram export ZIPs, WhatsApp chat text, or discovery call transcripts.
                </p>
              </div>

              <ImportManager onImportCompleted={loadAllData} />
            </div>
          )}

          {/* TAB 4: SALES LEARNINGS & MEMORY */}
          {activeTab === 'learnings' && <LearningsManager />}

          {/* TAB 5: PORTFOLIO LIBRARY */}
          {activeTab === 'portfolio' && <PortfolioManager projects={portfolio} />}

          {/* TAB 6: AUTONOMOUS AI CONTROL CENTER */}
          {activeTab === 'agent' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-[#F4F1EA]">AI Control Center</h2>
                <p className="text-xs text-[#8C98A9] mt-0.5">
                  One switch at the top starts or stops your AI. It trains itself on your portfolio and pricing, then
                  researches, qualifies and drafts — and only ever answers people who message you. Unusual cases
                  escalate to you automatically.
                </p>
              </div>
              <AgentControlPanel isOwner={sessionUser.role === 'OWNER'} />

              <div className="pt-6 mt-6 border-t border-[#1C232D]">
                <h3 className="text-sm font-bold text-[#F4F1EA] mb-3">Messaging &amp; Conversations</h3>
                <MessagingSettingsPanel />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Deep Lead Intelligence Dossier Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          portfolioProjects={portfolio}
          onClose={() => setSelectedLead(null)}
          onUpdate={loadAllData}
        />
      )}
    </div>
  );
}
