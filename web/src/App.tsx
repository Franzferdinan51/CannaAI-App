import { useState, useEffect, useCallback } from 'react';
import type { Page, ProviderConfig, AnalysisReport } from './types';
import { loadProviders } from './services/ai-providers';
import { loadJSON } from './utils/storage';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PlantAnalysis } from './components/PlantAnalysis';
import { Chat } from './components/Chat';
import { CouncilChamber } from './components/CouncilChamber';
import { StrainLibrary } from './components/StrainLibrary';
import { SettingsPanel } from './components/SettingsPanel';
import { AgentChat } from './components/AgentChat';

const REPORTS_KEY = 'cannaai_analysis_reports';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [reports, setReports] = useState<AnalysisReport[]>(() => loadJSON(REPORTS_KEY, []));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setProviders(loadProviders());
  }, []);

  // Sync reports from localStorage when page changes (PlantAnalysis saves to the same key)
  useEffect(() => {
    setReports(loadJSON(REPORTS_KEY, []));
  }, [page]);

  const handleProvidersChange = useCallback((updated: ProviderConfig[]) => {
    setProviders(updated);
  }, []);

  return (
    <div className="app-layout">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>

      <Sidebar
        activePage={page}
        onNavigate={setPage}
        providers={providers}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="main-content">
        {page === 'dashboard' && (
          <Dashboard providers={providers} reports={reports} onNavigate={setPage} />
        )}
        {page === 'analysis' && <PlantAnalysis providers={providers} />}
        {page === 'chat' && <Chat providers={providers} />}
        {page === 'agent' && <AgentChat providers={providers} />}
        {page === 'council' && <CouncilChamber providers={providers} />}
        {page === 'strains' && <StrainLibrary />}
        {page === 'settings' && <SettingsPanel onProvidersChange={handleProvidersChange} />}
      </main>
    </div>
  );
}
