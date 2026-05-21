import type { ProviderConfig, AnalysisReport, Page } from '../types';

interface Props {
  providers: ProviderConfig[];
  reports: AnalysisReport[];
  onNavigate: (page: Page) => void;
}

export function Dashboard({ providers, reports, onNavigate }: Props) {
  const activeProviders = providers.filter((p) => p.textModel || p.visionModel);

  const recentReports = reports.slice(0, 5);
  const avgScore = reports.length > 0
    ? Math.round(reports.reduce((sum, r) => sum + r.result.healthScore, 0) / reports.length)
    : null;

  const urgencyCounts = reports.reduce(
    (acc, r) => {
      acc[r.result.urgency] = (acc[r.result.urgency] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your CannaAI system and recent activity.</p>
      </div>

      {/* Stats Grid */}
      <div className="card-grid" style={{ marginBottom: 24 }}>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('settings')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-glow)', borderRadius: 'var(--radius)' }}>
              🔌
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                {activeProviders.length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active Providers</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
            {providers.length > 0
              ? providers.map((p) => p.name).join(', ')
              : 'No providers configured'}
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('analysis')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(66, 165, 245, 0.15)', borderRadius: 'var(--radius)' }}>
              🌿
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--info)' }}>
                {reports.length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Analyses</div>
            </div>
          </div>
          {avgScore !== null && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              Average health score: {avgScore}/100
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 167, 38, 0.15)', borderRadius: 'var(--radius)' }}>
              ⚠️
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>
                {(urgencyCounts.high || 0) + (urgencyCounts.critical || 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>High/Critical Issues</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
            Low: {urgencyCounts.low || 0} &middot; Medium: {urgencyCounts.medium || 0} &middot; High: {urgencyCounts.high || 0} &middot; Critical: {urgencyCounts.critical || 0}
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('council')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(171, 71, 188, 0.15)', borderRadius: 'var(--radius)' }}>
              🧠
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ab47bc' }}>
                6
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Council Members</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
            Cultivator, Inspector, Nutrients, IPM, Cure, Compliance
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('analysis')}>
            🌿 New Plant Analysis
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('council')}>
            🧠 Council Consultation
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('strains')}>
            📚 Browse Strains
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('settings')}>
            ⚙️ Configure Providers
          </button>
        </div>
      </div>

      {/* Recent Analyses */}
      {recentReports.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Recent Analyses</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('analysis')}>
              View All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentReports.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius)',
                  transition: 'background var(--transition)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.result.diagnosis}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {r.provider} &middot; {new Date(r.timestamp).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: r.result.healthScore >= 70 ? 'var(--success)' : r.result.healthScore >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
                    {r.result.healthScore}
                  </span>
                  <span className={`badge ${r.result.urgency === 'low' ? 'badge-green' : r.result.urgency === 'medium' ? 'badge-yellow' : 'badge-red'}`}>
                    {r.result.urgency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Council Members Preview */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">AI Council Members</div>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('council')}>
            Open Council
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { emoji: '🌱', name: 'The Cultivator', role: 'Master Grower' },
            { emoji: '🔬', name: 'The Trichome Inspector', role: 'Harvest Specialist' },
            { emoji: '🧪', name: 'The Nutrient Manager', role: 'Feeding Expert' },
            { emoji: '🛡️', name: 'The IPM Specialist', role: 'Pest & Disease' },
            { emoji: '🏺', name: 'The Cure Master', role: 'Post-Harvest' },
            { emoji: '📋', name: 'The Compliance Officer', role: 'Regulations' },
          ].map((c) => (
            <div
              key={c.name}
              style={{
                padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'background var(--transition), border-color var(--transition)',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.borderColor = 'transparent'; }}
              onClick={() => onNavigate('council')}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>{c.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.role}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
