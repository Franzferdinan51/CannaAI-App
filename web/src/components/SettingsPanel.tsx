import { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig, ProviderType, WebSearchConfig, WebSearchProvider } from '../types';
import { loadProviders, saveProviders, fetchModels, checkProviderHealth } from '../services/ai-providers';
import { loadJSON, saveJSON, loadTemperatureUnit } from '../utils/storage';
import { loadWebSearchConfig } from '../services/web-search';

type SettingsTab = 'providers' | 'plant-doctor' | 'appearance' | 'data' | 'about';

const ACCENT_COLORS = [
  { name: 'Green', value: '#4caf50' },
  { name: 'Blue', value: '#42a5f5' },
  { name: 'Purple', value: '#ab47bc' },
  { name: 'Orange', value: '#ffa726' },
  { name: 'Teal', value: '#26a69a' },
  { name: 'Pink', value: '#ec407a' },
  { name: 'Red', value: '#ef5350' },
  { name: 'Amber', value: '#ffca28' },
];

const FONT_SIZES = [
  { label: 'Small', value: '13px' },
  { label: 'Default', value: '14px' },
  { label: 'Large', value: '15px' },
  { label: 'Extra Large', value: '16px' },
];

function getStorageUsage(): { used: number; total: number } {
  let used = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const val = localStorage.getItem(key);
      if (val) used += key.length + val.length;
    }
  }
  return { used: used * 2, total: 5 * 1024 * 1024 }; // ~5MB typical limit
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  onProvidersChange: (providers: ProviderConfig[]) => void;
}

export function SettingsPanel({ onProvidersChange }: Props) {
  const [tab, setTab] = useState<SettingsTab>('providers');

  // Provider state
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, string[]>>({});
  const [healthStatus, setHealthStatus] = useState<Record<string, 'checking' | 'online' | 'offline'>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Web search state (Plant Doctor)
  const [webSearch, setWebSearch] = useState<WebSearchConfig>(() => loadWebSearchConfig());

  const updateWebSearch = (updates: Partial<WebSearchConfig>) => {
    const updated = { ...webSearch, ...updates };
    setWebSearch(updated);
    saveJSON('cannaai-web-search', updated);
  };

  // Temperature unit state
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(() => loadTemperatureUnit());

  // Analysis timeout state
  const [analysisTimeout, setAnalysisTimeout] = useState(() => loadJSON('cannaai-analysis-timeout', 300000));

  // Appearance state
  const [accentColor, setAccentColor] = useState(() => loadJSON('cannaai-accent', '#4caf50'));
  const [fontSize, setFontSize] = useState(() => loadJSON('cannaai-fontsize', '14px'));
  const [compactMode, setCompactMode] = useState(() => loadJSON('cannaai-compact', false));
  const [showAnimations, setShowAnimations] = useState(() => loadJSON('cannaai-animations', true));

  // Data state
  const [storageUsage, setStorageUsage] = useState(getStorageUsage);

  useEffect(() => {
    const loaded = loadProviders();
    setProviders(loaded);
  }, []);

  // Apply appearance changes to the document
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
    // Generate accent-hover (lighter) and accent-dim (darker)
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-hover', `rgba(${Math.min(r + 30, 255)}, ${Math.min(g + 30, 255)}, ${Math.min(b + 30, 255)}, 1)`);
    document.documentElement.style.setProperty('--accent-dim', `rgba(${Math.max(r - 40, 0)}, ${Math.max(g - 40, 0)}, ${Math.max(b - 40, 0)}, 1)`);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.15)`);
    saveJSON('cannaai-accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.style.setProperty('--page-font-size', fontSize);
    saveJSON('cannaai-fontsize', fontSize);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', compactMode);
    saveJSON('cannaai-compact', compactMode);
  }, [compactMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('no-animations', !showAnimations);
    saveJSON('cannaai-animations', showAnimations);
  }, [showAnimations]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateAndSave = useCallback(
    (updated: ProviderConfig[]) => {
      setProviders(updated);
      saveProviders(updated);
      onProvidersChange(updated);
    },
    [onProvidersChange]
  );

  // ---- Provider handlers ----

  const addProvider = (type: ProviderType) => {
    const id = `${type}-${Date.now()}`;
    const defaults: Record<ProviderType, { name: string; baseUrl: string }> = {
      lmstudio: { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
      openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
      'nvidia-nim': { name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1' },
      'openai-compatible': { name: 'OpenAI Compatible', baseUrl: 'https://api.openai.com/v1' },
    };
    const { name, baseUrl } = defaults[type];
    const newProvider: ProviderConfig = {
      id,
      type,
      name,
      baseUrl,
      apiKey: '',
      textModel: '',
      visionModel: '',
      isDefault: providers.length === 0,
    };
    updateAndSave([...providers, newProvider]);
    setEditingId(id);
  };

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    const updated = providers.map((p) => (p.id === id ? { ...p, ...updates } : p));
    updateAndSave(updated);
  };

  const removeProvider = (id: string) => {
    const updated = providers.filter((p) => p.id !== id);
    if (updated.length > 0 && !updated.some((p) => p.isDefault)) {
      updated[0].isDefault = true;
    }
    updateAndSave(updated);
    showToast('Provider removed');
  };

  const setDefault = (id: string) => {
    const updated = providers.map((p) => ({ ...p, isDefault: p.id === id }));
    updateAndSave(updated);
    showToast('Default provider updated');
  };

  const testConnection = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    setHealthStatus((prev) => ({ ...prev, [id]: 'checking' }));
    const result = await checkProviderHealth(provider);
    setHealthStatus((prev) => ({ ...prev, [id]: result.ok ? 'online' : 'offline' }));
    if (result.ok) {
      setDiscoveredModels((prev) => ({ ...prev, [id]: result.models }));
      showToast(`Connected! Found ${result.models.length} models.`);
    } else {
      showToast(`Connection failed: ${result.error}`, 'error');
    }
  };

  const discoverModels = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    setHealthStatus((prev) => ({ ...prev, [id]: 'checking' }));
    const models = await fetchModels(provider);
    setHealthStatus((prev) => ({ ...prev, [id]: models.length > 0 ? 'online' : 'offline' }));
    setDiscoveredModels((prev) => ({ ...prev, [id]: models }));
    if (models.length > 0) {
      showToast(`Found ${models.length} models from ${provider.name}`);
    } else {
      showToast(`No models found. Check your connection.`, 'error');
    }
  };

  // ---- Data handlers ----

  const exportAllData = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cannaai')) {
        const val = localStorage.getItem(key);
        if (val) {
          try { data[key] = JSON.parse(val); } catch { data[key] = val; }
        }
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cannaai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('cannaai')) {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            count++;
          }
        }
        setStorageUsage(getStorageUsage());
        showToast(`Imported ${count} settings. Refresh to see changes.`);
      } catch {
        showToast('Invalid backup file', 'error');
      }
    };
    input.click();
  };

  const clearCustomStrains = () => {
    localStorage.removeItem('cannaai-custom-strains');
    setStorageUsage(getStorageUsage());
    showToast('Custom strains cleared');
  };

  const clearAllData = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cannaai')) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setStorageUsage(getStorageUsage());
    showToast('All CannaAI data cleared. Refresh to see defaults.');
  };

  const tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'providers', label: 'AI Providers', icon: '' },
    { key: 'plant-doctor', label: 'Plant Doctor', icon: '' },
    { key: 'appearance', label: 'Appearance', icon: '' },
    { key: 'data', label: 'Data & Storage', icon: '' },
    { key: 'about', label: 'About', icon: '' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure CannaAI to your preferences.</p>
      </div>

      {/* Tab bar */}
      <div className="settings-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`settings-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px',
              background: tab === t.key ? 'var(--accent-glow)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              transition: 'all 150ms ease',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ==================== PROVIDERS TAB ==================== */}
      {tab === 'providers' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => addProvider('lmstudio')}>
              + Add LM Studio
            </button>
            <button className="btn btn-secondary" onClick={() => addProvider('openrouter')}>
              + Add OpenRouter
            </button>
            <button className="btn btn-secondary" onClick={() => addProvider('nvidia-nim')}>
              + Add NVIDIA NIM
            </button>
            <button className="btn btn-secondary" onClick={() => addProvider('openai-compatible')}>
              + Add OpenAI Compatible
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {providers.map((provider) => {
              const isEditing = editingId === provider.id;
              const models = discoveredModels[provider.id] || [];
              const health = healthStatus[provider.id];

              return (
                <div key={provider.id} className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <span className={`status-dot ${health === 'online' ? 'online' : health === 'offline' ? 'offline' : 'unknown'}`} />
                      {isEditing ? (
                        <input
                          className="input"
                          style={{ maxWidth: 300 }}
                          value={provider.name}
                          onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
                        />
                      ) : (
                        <span>
                          {provider.name}
                          {provider.isDefault && (
                            <span className="badge badge-green" style={{ marginLeft: 8 }}>Default</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!provider.isDefault && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setDefault(provider.id)}>
                          Set Default
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(isEditing ? null : provider.id)}>
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeProvider(provider.id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="input-group">
                          <label>Provider Type</label>
                          <select className="select" value={provider.type}
                            onChange={(e) => updateProvider(provider.id, { type: e.target.value as ProviderType })}>
                            <option value="lmstudio">LM Studio (Local)</option>
                            <option value="openrouter">OpenRouter (Cloud)</option>
                            <option value="nvidia-nim">NVIDIA NIM</option>
                            <option value="openai-compatible">OpenAI Compatible</option>
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Base URL</label>
                          <input className="input" value={provider.baseUrl}
                            onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                            placeholder={
                              provider.type === 'lmstudio' ? 'http://localhost:1234/v1' :
                              provider.type === 'openrouter' ? 'https://openrouter.ai/api/v1' :
                              provider.type === 'nvidia-nim' ? 'https://integrate.api.nvidia.com/v1' :
                              'https://api.openai.com/v1'
                            } />
                        </div>
                      </div>

                      <div className="input-group">
                        <label>API Key {provider.type === 'lmstudio' ? '(optional for local)' : ''}</label>
                        <input className="input" type="password" value={provider.apiKey}
                          onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                          placeholder={
                            provider.type === 'openrouter' ? 'sk-or-...' :
                            provider.type === 'nvidia-nim' ? 'nvapi-...' :
                            provider.type === 'openai-compatible' ? 'sk-...' :
                            'lm-studio'
                          } />
                      </div>

                      <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="input-group">
                          <label>Text Model</label>
                          {models.length > 0 ? (
                            <select className="select" value={provider.textModel}
                              onChange={(e) => updateProvider(provider.id, { textModel: e.target.value })}>
                              <option value="">-- Select Model --</option>
                              {models.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (
                            <input className="input" value={provider.textModel}
                              onChange={(e) => updateProvider(provider.id, { textModel: e.target.value })}
                              placeholder={'e.g. qwen/qwen3.5-27b or model name'} />
                          )}
                        </div>
                        <div className="input-group">
                          <label>Vision Model (for image analysis)</label>
                          {models.length > 0 ? (
                            <select className="select" value={provider.visionModel}
                              onChange={(e) => updateProvider(provider.id, { visionModel: e.target.value })}>
                              <option value="">-- Select Model --</option>
                              {models.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (
                            <input className="input" value={provider.visionModel}
                              onChange={(e) => updateProvider(provider.id, { visionModel: e.target.value })}
                              placeholder={'e.g. qwen-vl-max or vision model name'} />
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => testConnection(provider.id)} disabled={health === 'checking'}>
                          {health === 'checking' ? <span className="spinner" /> : null}
                          Test Connection
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => discoverModels(provider.id)} disabled={health === 'checking'}>
                          Discover Models
                        </button>
                      </div>

                      {models.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <strong>Available models ({models.length}):</strong> {models.slice(0, 10).join(', ')}
                          {models.length > 10 && ` ...and ${models.length - 10} more`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>Type: {
                        provider.type === 'lmstudio' ? 'LM Studio' :
                        provider.type === 'openrouter' ? 'OpenRouter' :
                        provider.type === 'nvidia-nim' ? 'NVIDIA NIM' :
                        'OpenAI Compatible'
                      }</span>
                      <span>URL: {provider.baseUrl}</span>
                      <span>Text: {provider.textModel || 'Not set'}</span>
                      <span>Vision: {provider.visionModel || 'Not set'}</span>
                      <span>Key: {provider.apiKey ? '****' + provider.apiKey.slice(-4) : 'Not set'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {providers.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#9881;</div>
              <h3 style={{ marginBottom: 8 }}>No Providers Configured</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                Add a provider (LM Studio, OpenRouter, NVIDIA NIM, etc.) to start using CannaAI.
              </p>
            </div>
          )}

          {/* Analysis Timeout */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Analysis Request Timeout</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              How long to wait for an AI analysis response before timing out. Increase this if you have a slow computer or network connection. Vision analysis with large images can take longer.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={60}
                max={600}
                step={30}
                value={Math.round(analysisTimeout / 1000)}
                onChange={(e) => {
                  const ms = parseInt(e.target.value) * 1000;
                  setAnalysisTimeout(ms);
                  saveJSON('cannaai-analysis-timeout', ms);
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                {Math.round(analysisTimeout / 1000)}s
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              <span>1 min</span>
              <span>Recommended: 3-5 min for vision</span>
              <span>10 min</span>
            </div>
          </div>

          <div className="card" style={{ marginTop: 32 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Quick Setup Guide</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: 8 }}>
                <strong>LM Studio (Local, Free):</strong> Download from{' '}
                <span style={{ color: 'var(--accent)' }}>lmstudio.ai</span>, load a model, start the local server.
                Default URL is <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>http://localhost:1234/v1</code>.
                No API key needed.
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>OpenRouter (Cloud):</strong> Get an API key from{' '}
                <span style={{ color: 'var(--accent)' }}>openrouter.ai/keys</span>.
                Free tier available with select models. For vision, try{' '}
                <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>qwen-vl-max</code>.
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>NVIDIA NIM:</strong> Get an API key from{' '}
                <span style={{ color: 'var(--accent)' }}>build.nvidia.com</span>.
                Base URL: <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>https://integrate.api.nvidia.com/v1</code>.
              </p>
              <p>
                <strong>OpenAI Compatible:</strong> Use any OpenAI-compatible API (OpenAI, Together, Groq, etc.).
              </p>
            </div>
          </div>
        </>
      )}

      {/* ==================== PLANT DOCTOR TAB ==================== */}
      {tab === 'plant-doctor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Temperature Unit */}
          <div className="card">
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn ${tempUnit === 'F' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setTempUnit('F'); saveJSON('cannaai-temp-unit', 'F'); }}
                style={{ minWidth: 100 }}
              >
                Fahrenheit (°F)
              </button>
              <button
                className={`btn ${tempUnit === 'C' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setTempUnit('C'); saveJSON('cannaai-temp-unit', 'C'); }}
                style={{ minWidth: 100 }}
              >
                Celsius (°C)
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
              Currently: {tempUnit === 'F' ? 'Fahrenheit (°F)' : 'Celsius (°C)'} — Optimal ranges: {tempUnit === 'F' ? '68-79°F for most stages' : '20-26°C for most stages'}
            </div>
          </div>

          {/* Web Search Toggle */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Web Search for Plant Diagnosis</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Allow the Plant Doctor agent to search the web for plant disease information, treatment research, and growing techniques.
              This helps the agent provide more accurate diagnoses when its built-in knowledge is insufficient.
            </p>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Enable Web Search</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Off by default. The agent will only search when this is enabled.
                </div>
              </div>
              <ToggleSwitch checked={webSearch.enabled} onChange={(v) => updateWebSearch({ enabled: v })} />
            </label>

            {webSearch.enabled && (
              <>
                {/* Provider Selection */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Search Provider</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {([
                      { value: 'brave', label: 'Brave Search', desc: 'API key required' },
                      { value: 'tavily', label: 'Tavily', desc: 'API key required' },
                      { value: 'searxng', label: 'SearXNG', desc: 'Self-hosted, no key needed' },
                    ] as Array<{ value: WebSearchProvider; label: string; desc: string }>).map((p) => (
                      <button
                        key={p.value}
                        className={`btn ${webSearch.provider === p.value ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateWebSearch({ provider: p.value })}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 20px', minWidth: 140 }}
                      >
                        <span style={{ fontWeight: 600 }}>{p.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Provider-specific config */}
                {webSearch.provider === 'brave' && (
                  <div className="input-group" style={{ marginBottom: 16 }}>
                    <label>Brave Search API Key</label>
                    <input
                      className="input"
                      type="password"
                      value={webSearch.braveApiKey}
                      onChange={(e) => updateWebSearch({ braveApiKey: e.target.value })}
                      placeholder="BSA..."
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      Get a free API key at{' '}
                      <span style={{ color: 'var(--accent)' }}>brave.com/search/api</span>
                    </div>
                  </div>
                )}

                {webSearch.provider === 'tavily' && (
                  <div className="input-group" style={{ marginBottom: 16 }}>
                    <label>Tavily API Key</label>
                    <input
                      className="input"
                      type="password"
                      value={webSearch.tavilyApiKey}
                      onChange={(e) => updateWebSearch({ tavilyApiKey: e.target.value })}
                      placeholder="tvly-..."
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      Get an API key at{' '}
                      <span style={{ color: 'var(--accent)' }}>tavily.com</span>
                    </div>
                  </div>
                )}

                {webSearch.provider === 'searxng' && (
                  <div className="input-group" style={{ marginBottom: 16 }}>
                    <label>SearXNG Server URL</label>
                    <input
                      className="input"
                      value={webSearch.searxngUrl}
                      onChange={(e) => updateWebSearch({ searxngUrl: e.target.value })}
                      placeholder="http://localhost:8888"
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      URL of your SearXNG instance. Must have JSON format enabled.
                    </div>
                  </div>
                )}

                {/* Max Results */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Max Results per Search</div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>{webSearch.maxResults}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={webSearch.maxResults}
                    onChange={(e) => updateWebSearch({ maxResults: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    <span>1</span>
                    <span>More results = more context but slower</span>
                    <span>10</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Info card */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>How It Works</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: 8 }}>
                When web search is enabled, the Plant Doctor agent gains a <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>web_search</code> tool
                that it can use during diagnosis to look up information online.
              </p>
              <p style={{ marginBottom: 8 }}>
                The agent will search for relevant plant health information when it encounters unfamiliar symptoms,
                needs to verify a diagnosis, or requires up-to-date treatment recommendations.
              </p>
              <p>
                <strong>Privacy:</strong> Only the search query is sent to the search provider. No plant images or
                personal data are included in search requests.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== APPEARANCE TAB ==================== */}
      {tab === 'appearance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Accent Color */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Accent Color</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Choose the primary accent color used throughout the app.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setAccentColor(c.value)}
                  title={c.name}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: c.value,
                    border: accentColor === c.value ? '3px solid var(--text-primary)' : '3px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    boxShadow: accentColor === c.value ? `0 0 12px ${c.value}40` : 'none',
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)' }}>
              Selected: {accentColor}
            </div>
          </div>

          {/* Font Size */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Font Size</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Adjust the base font size for better readability.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {FONT_SIZES.map((f) => (
                <button
                  key={f.value}
                  className={`btn ${fontSize === f.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFontSize(f.value)}
                  style={{ fontSize: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Interface</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Compact Mode</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Reduce padding and spacing for more content on screen.
                  </div>
                </div>
                <ToggleSwitch checked={compactMode} onChange={setCompactMode} />
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Animations</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Enable hover effects and transitions. Disable for performance.
                  </div>
                </div>
                <ToggleSwitch checked={showAnimations} onChange={setShowAnimations} />
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Climate Temperature Unit</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Display grow room temperatures in {tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tempUnit === 'C' ? 'var(--accent)' : 'var(--text-dim)' }}>°C</span>
                  <ToggleSwitch
                    checked={tempUnit === 'F'}
                    onChange={(isF) => { const unit = isF ? 'F' : 'C'; setTempUnit(unit); saveJSON('cannaai-temp-unit', unit); }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: tempUnit === 'F' ? 'var(--accent)' : 'var(--text-dim)' }}>°F</span>
                </div>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Preview</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary">Primary Button</button>
              <button className="btn btn-secondary">Secondary</button>
              <button className="btn btn-danger btn-sm">Danger</button>
              <span className="badge badge-green">Badge</span>
              <span className="badge badge-yellow">Warning</span>
              <span className="badge badge-red">Error</span>
              <input className="input" style={{ maxWidth: 200 }} placeholder="Input preview..." />
            </div>
          </div>
        </div>
      )}

      {/* ==================== DATA TAB ==================== */}
      {tab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Storage Usage */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Storage Usage</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Used</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.total)}
                </span>
              </div>
              <div className="score-bar" style={{ height: 10 }}>
                <div
                  className={`score-bar-fill ${storageUsage.used / storageUsage.total > 0.8 ? 'poor' : storageUsage.used / storageUsage.total > 0.5 ? 'moderate' : 'good'}`}
                  style={{ width: `${Math.min((storageUsage.used / storageUsage.total) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Data is stored in your browser's localStorage. No data is sent to any server.
            </div>
          </div>

          {/* Export / Import */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Backup & Restore</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Export your settings, custom strains, and provider configurations as a JSON file. Import to restore.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={exportAllData}>
                Export All Data
              </button>
              <button className="btn btn-secondary" onClick={importData}>
                Import from File
              </button>
            </div>
          </div>

          {/* Clear Data */}
          <div className="card" style={{ borderColor: 'var(--danger-dim)' }}>
            <div className="card-title" style={{ marginBottom: 16, color: 'var(--danger)' }}>Danger Zone</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Clear Custom Strains</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Remove all strains you've added to the library.
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={clearCustomStrains}>
                  Clear Strains
                </button>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Reset Everything</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Delete all CannaAI data including providers, settings, and custom strains.
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={clearAllData}>
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ABOUT TAB ==================== */}
      {tab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>&#127807;</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              CannaAI
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8 }}>
              AI-Powered Cannabis Cultivation Assistant
            </p>
            <span className="badge badge-green">v1.0.0</span>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Features</div>
            <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { name: 'Plant Analysis', desc: 'AI-powered diagnosis from photos' },
                { name: 'AI Chat', desc: 'Expert growing advice on demand' },
                { name: 'Council Chamber', desc: 'Multi-AI deliberation system' },
                { name: 'Strain Library', desc: 'Browse and manage strain data' },
                { name: 'Agent System', desc: 'Autonomous diagnostic planning' },
                { name: 'Multi-Provider', desc: 'LM Studio, OpenRouter, NVIDIA NIM, OpenAI Compatible' },
              ].map((f) => (
                <div key={f.name} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Technology</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: 8 }}>
                Built with <strong>React</strong> + <strong>TypeScript</strong> and powered by <strong>Vite</strong>.
                Runs entirely in your browser with no backend server required.
              </p>
              <p style={{ marginBottom: 8 }}>
                All data stays on your device. AI requests go directly from your browser to your configured provider.
              </p>
              <p>
                Supports any OpenAI-compatible API endpoint for maximum flexibility.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Credits</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              Based on{' '}
              <a
                href="https://github.com/Franzferdinan51/CannaAI"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}
              >
                https://github.com/Franzferdinan51/CannaAI
              </a>
            </p>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ---- Toggle Switch component ----
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 48,
        height: 26,
        borderRadius: 13,
        border: 'none',
        background: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 150ms ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 25 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: checked ? '#000' : 'var(--text-muted)',
          transition: 'all 150ms ease',
        }}
      />
    </button>
  );
}
