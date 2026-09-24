/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { LeadTable } from './components/leads/LeadTable';
import { LeadDetailModal } from './components/leads/LeadDetailModal';
import { ImportManager } from './components/imports/ImportManager';
import { LearningsManager } from './components/learnings/LearningsManager';
import { PortfolioManager } from './components/portfolio/PortfolioManager';
import { api } from './lib/api';
import {
  LeadItem,
  DashboardStats,
  PortfolioProjectItem,
  ConfigInfo,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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
    loadAllData();
  }, [statusFilter, intentFilter, nicheFilter, sourceFilter, searchQuery, followUpOnly]);

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

  return (
    <div className="flex min-h-screen bg-[#0C0F13] text-[#F4F1EA] selection:bg-[#2F7EF2] selection:text-white">
      {/* Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        geminiConfigured={config?.geminiConfigured ?? false}
        followUpCount={dashboardStats?.followUps ?? 0}
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
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && dashboardStats && (
            <DashboardOverview
              stats={dashboardStats}
              onSelectLead={handleSelectLeadById}
              onNavigateToLeads={handleNavigateToLeads}
              onOpenImport={() => setActiveTab('imports')}
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
