import type { Page, ProviderConfig } from '../types';

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
  providers: ProviderConfig[];
  isOpen: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: { page: Page; icon: string; label: string; section?: string }[] = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard', section: 'main' },
  { page: 'analysis', icon: '🌿', label: 'Plant Analysis', section: 'main' },
  { page: 'chat', icon: '💬', label: 'Chat', section: 'main' },
  { page: 'agent', icon: '🤖', label: 'Plant Doctor Agent', section: 'main' },
  { page: 'council', icon: '🧠', label: 'AI Council', section: 'main' },
  { page: 'strains', icon: '📚', label: 'Strain Library', section: 'tools' },
  { page: 'settings', icon: '⚙️', label: 'Settings', section: 'system' },
];

export function Sidebar({ activePage, onNavigate, providers, isOpen, onToggle }: Props) {
  const activeProviders = providers.filter((p) => p.textModel || p.visionModel);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 40,
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={onToggle}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="sidebar-logo-icon">🌿</span>
            <div className="sidebar-logo-text">
              <h1>CannaAI</h1>
              <span>AI Plant Analysis</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => {
            const showSection =
              item.section &&
              (i === 0 || NAV_ITEMS[i - 1].section !== item.section);

            return (
              <div key={item.page}>
                {showSection && item.section && (
                  <div className="nav-section-label">
                    {item.section === 'main'
                      ? 'Main'
                      : item.section === 'tools'
                      ? 'Tools'
                      : 'System'}
                  </div>
                )}
                <button
                  className={`nav-item ${activePage === item.page ? 'active' : ''}`}
                  onClick={() => {
                    onNavigate(item.page);
                    if (window.innerWidth <= 768) onToggle();
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Provider Status */}
        <div className="sidebar-footer">
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
              Providers
            </span>
          </div>
          {providers.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>No providers configured</div>
          ) : (
            providers.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  marginBottom: 4,
                  color: p.textModel || p.visionModel ? 'var(--text-secondary)' : 'var(--text-dim)',
                }}
              >
                <span
                  className={`status-dot ${p.textModel || p.visionModel ? 'online' : 'unknown'}`}
                />
                {p.name}
                {p.isDefault && <span style={{ fontSize: 9, color: 'var(--accent)' }}>(default)</span>}
              </div>
            ))
          )}
          {activeProviders.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--accent)' }}>
              {activeProviders.length} provider{activeProviders.length !== 1 ? 's' : ''} ready
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
