import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  ProviderConfig,
  AnalysisParams,
  GrowthStage,
  AnalysisReport,
} from '../types';
import type { AgentMessage, AgentSession } from '../services/agent';
import { PlantDoctorAgent } from '../services/agent';
import { AnalysisReport as AnalysisReportView } from './AnalysisReport';
import { MarkdownContent, CopyButton } from './MarkdownContent';
import { GROWTH_STAGES, QUICK_SYMPTOMS, COMMON_MEDIA } from '../constants';
import { loadTemperatureUnit } from '../utils/storage';

interface Props {
  providers: ProviderConfig[];
}

const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.8;

/** Convert any image (WEBP, PNG, etc.) to JPEG data URL for universal provider support. */
function normalizeImageToJpeg(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Already JPEG — pass through
    if (dataUrl.startsWith('data:image/jpeg')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

type ViewMode = 'setup' | 'chat' | 'result';

export function AgentChat({ providers }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [params, setParams] = useState<AnalysisParams>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agent, setAgent] = useState<PlantDoctorAgent | null>(null);
  const [, setReports] = useState<AnalysisReport[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tempUnit] = useState<'C' | 'F'>(() => loadTemperatureUnit());
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpImage, setFollowUpImage] = useState<string | null>(null);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const followUpFileRef = useRef<HTMLInputElement>(null);
  const followUpInputRef = useRef<HTMLInputElement>(null);
  const questionFileRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentSession?.messages]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const jpeg = await normalizeImageToJpeg(dataUrl);
        setImagePreview(jpeg);
        setParams((prev) => ({ ...prev, image: jpeg }));
      } catch {
        setImagePreview(dataUrl);
        setParams((prev) => ({ ...prev, image: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFollowUpImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        setFollowUpImage(await normalizeImageToJpeg(dataUrl));
      } catch {
        setFollowUpImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQuestionImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        setQuestionImage(await normalizeImageToJpeg(dataUrl));
      } catch {
        setQuestionImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setParams((prev) => ({ ...prev, image: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdate = useCallback((session: AgentSession) => {
    setAgentSession({ ...session });
    if (
      session.status === 'done' ||
      session.status === 'asking_user' ||
      session.status === 'error'
    ) {
      setIsProcessing(false);
    }
  }, []);

  const startAgent = async () => {
    if (!params.image && !params.symptoms?.length && !params.notes) {
      return;
    }

    const activeProviders = providers.filter((p) => p.textModel || p.visionModel);
    if (activeProviders.length === 0) return;

    setViewMode('chat');
    setIsProcessing(true);

    const newAgent = new PlantDoctorAgent(providers, handleUpdate);
    setAgent(newAgent);

    try {
      await newAgent.start({
        image: params.image,
        symptoms: params.symptoms,
        strain: params.strain,
        growthStage: params.growthStage,
        medium: params.medium,
        phLevel: params.phLevel,
        temperature: params.temperature,
        humidity: params.humidity,
        notes: params.notes,
      });
    } catch (err) {
      console.error('Agent error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const continueAgent = async () => {
    if (!userInput.trim() || !agent) return;
    setIsProcessing(true);
    const msg = userInput.trim();
    const img = questionImage;
    setUserInput('');
    setQuestionImage(null);
    try {
      await agent.continueWithUserResponse(msg, img || undefined);
    } catch (err) {
      console.error('Agent continue error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendFollowUp = async () => {
    if ((!followUpInput.trim() && !followUpImage) || !agent) return;
    const msg = followUpInput.trim() || 'Please analyze this image.';
    setFollowUpInput('');
    const img = followUpImage;
    setFollowUpImage(null);
    setIsProcessing(true);
    try {
      await agent.followUp(msg, img || undefined);
    } catch (err) {
      console.error('Follow-up error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveReport = () => {
    if (!agentSession?.result) return;
    const report: AnalysisReport = {
      id: `report-${Date.now()}`,
      timestamp: Date.now(),
      params,
      result: agentSession.result,
      provider: 'Agent',
      model: 'Plant Doctor Agent',
      councilUsed: false,
    };
    setReports((prev) => [report, ...prev].slice(0, 20));
  };

  const resetAgent = () => {
    setViewMode('setup');
    setAgentSession(null);
    setAgent(null);
    setIsProcessing(false);
    setParams({});
    setImagePreview(null);
    setFollowUpInput('');
    setFollowUpImage(null);
    setQuestionImage(null);
  };

  const hasProvider = providers.some((p) => p.textModel || p.visionModel);
  const hasInput = params.image || params.symptoms?.length || params.notes;

  // Filter visible messages (hide internal system messages and raw JSON leaks)
  const visibleMessages = agentSession?.messages.filter((m) => {
    if (m.role === 'system' && m.internal) return false;
    // Hide system messages that look like raw JSON
    if (m.role === 'system' && (m.content.trim().startsWith('{') || m.content.trim().startsWith('```'))) return false;
    // Hide empty agent messages
    if (m.role === 'agent' && !m.content?.trim() && !m.thinking) return false;
    // Hide plan/reflection messages that are just internal bookkeeping
    if ((m.role === 'plan' || m.role === 'reflection') && !m.content?.trim()) return false;
    return true;
  }) || [];

  // --- RENDER: Setup View ---
  if (viewMode === 'setup') {
    return (
      <div className="page">
        <div className="page-header">
          <h2>Plant Doctor Agent</h2>
          <p>Tell me about your plant and I'll diagnose it step-by-step. I'll ask follow-up questions as needed.</p>
        </div>

        <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Conversation Starter */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Image Upload */}
                <div style={{ flexShrink: 0 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  {imagePreview ? (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={imagePreview}
                        alt="Plant"
                        style={{
                          width: 140,
                          height: 140,
                          objectFit: 'cover',
                          borderRadius: 'var(--radius)',
                          border: '2px solid var(--border)',
                        }}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          width: 24,
                          height: 24,
                          padding: 0,
                          borderRadius: '50%',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          fontSize: 11,
                        }}
                        onClick={removeImage}
                      >
                        x
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: 140,
                        height: 140,
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        gap: 4,
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <span style={{ fontSize: 28 }}>📷</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Add photo</span>
                    </div>
                  )}
                </div>

                {/* Text Input */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>What's going on with your plant?</label>
                    <textarea
                      className="textarea"
                      placeholder="e.g. My Blue Dream is in week 4 of flower and the lower leaves are turning yellow with brown spots. Growing in coco, pH is 5.8..."
                      value={params.notes || ''}
                      onChange={(e) => setParams((p) => ({ ...p, notes: e.target.value }))}
                      rows={4}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  {/* Quick Symptom Tags */}
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Quick tags:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {QUICK_SYMPTOMS.map((symptom) => (
                        <button
                          key={symptom}
                          className={`btn btn-sm ${params.symptoms?.includes(symptom) ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => {
                            setParams((prev) => {
                              const current = prev.symptoms || [];
                              return {
                                ...prev,
                                symptoms: current.includes(symptom)
                                  ? current.filter((s) => s !== symptom)
                                  : [...current, symptom],
                              };
                            });
                          }}
                        >
                          {symptom}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Details (Collapsible) */}
            <div className="card">
              <button
                className="btn btn-ghost"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>Plant Details & Environment (optional)</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showAdvanced ? '▲ Hide' : '▼ Show'}</span>
              </button>

              {showAdvanced && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="input-group">
                      <label>Strain</label>
                      <input
                        className="input"
                        placeholder="e.g. Blue Dream"
                        value={params.strain || ''}
                        onChange={(e) => setParams((p) => ({ ...p, strain: e.target.value }))}
                      />
                    </div>
                    <div className="input-group">
                      <label>Growth Stage</label>
                      <select
                        className="select"
                        value={params.growthStage || ''}
                        onChange={(e) => setParams((p) => ({ ...p, growthStage: e.target.value as GrowthStage || undefined }))}
                      >
                        <option value="">-- Select --</option>
                        {GROWTH_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Growing Medium</label>
                    <select
                      className="select"
                      value={params.medium || ''}
                      onChange={(e) => setParams((p) => ({ ...p, medium: e.target.value || undefined }))}
                    >
                      <option value="">-- Select --</option>
                      {COMMON_MEDIA.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="input-group">
                      <label>pH Level</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        placeholder="6.5"
                        value={params.phLevel ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, phLevel: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      />
                    </div>
                    <div className="input-group">
                      <label>Temp ({tempUnit === 'F' ? '°F' : '°C'})</label>
                      <input
                        className="input"
                        type="number"
                        min={tempUnit === 'F' ? 32 : 0}
                        max={tempUnit === 'F' ? 122 : 50}
                        placeholder={tempUnit === 'F' ? '75' : '24'}
                        value={params.temperature ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, temperature: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      />
                    </div>
                    <div className="input-group">
                      <label>Humidity (%)</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="50"
                        value={params.humidity ?? ''}
                        onChange={(e) => setParams((p) => ({ ...p, humidity: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Start Button */}
            <button
              className="btn btn-primary btn-lg"
              onClick={startAgent}
              disabled={!hasInput || !hasProvider || isProcessing}
              style={{ width: '100%' }}
            >
              {isProcessing ? (
                <><span className="spinner" /> Starting Agent...</>
              ) : (
                <>🤖 Start Diagnosis</>
              )}
            </button>

            {!hasProvider && (
              <div style={{ fontSize: 13, color: 'var(--warning)', textAlign: 'center' }}>
                Configure a provider in Settings to use the agent.
              </div>
            )}
          </div>

          {/* Right: How It Works */}
          <div className="layout-split-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>How It Works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { icon: '💬', title: 'Describe', desc: 'Tell me what you see — or upload a photo' },
                  { icon: '🔍', title: 'Investigate', desc: 'I use tools to match symptoms, check your environment, and look up strain-specific issues' },
                  { icon: '❓', title: 'Ask & Answer', desc: 'I may ask you clarifying questions to narrow down the diagnosis' },
                  { icon: '📋', title: 'Diagnose', desc: 'Get a detailed report with causes, treatments, and follow-up plan' },
                  { icon: '🔄', title: 'Follow Up', desc: 'Ask me anything about the diagnosis — treatments, timelines, alternatives' },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      fontSize: 18,
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius)',
                      background: 'var(--bg-tertiary)',
                      flexShrink: 0,
                    }}>
                      {step.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 1 }}>{step.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>vs. Plant Analysis</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 8 }}>
                  <strong>Plant Analysis</strong> gives you a one-shot diagnosis from a single prompt.
                </p>
                <p>
                  <strong>Plant Doctor Agent</strong> reasons step-by-step, uses diagnostic tools, asks you questions, and lets you follow up after the diagnosis. It's like consulting with a specialist.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: Chat View ---
  if (viewMode === 'chat') {
    return (
      <div className="page">
        <div className="agent-chat-header">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Plant Doctor Agent</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              <span className={`agent-status-dot agent-status-${agentSession?.status || 'idle'}`} />
              {agentSession?.status === 'thinking' ? 'Thinking...' :
                agentSession?.status === 'using_tool' ? 'Using tool...' :
                  agentSession?.status === 'asking_user' ? 'Waiting for your response' :
                    agentSession?.status === 'done' ? 'Diagnosis complete — ask me anything' :
                      agentSession?.status === 'error' ? 'Something went wrong — ask me to try again or provide more details' : 'Starting...'}
              {agentSession && (
                <span style={{ marginLeft: 12, color: 'var(--text-dim)' }}>
                  ({agentSession.toolCalls} tool calls)
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {agentSession?.status === 'done' && agentSession.result && (
              <button className="btn btn-primary" onClick={() => { saveReport(); setViewMode('result'); }}>
                View Full Report
              </button>
            )}
            <button className="btn btn-secondary" onClick={resetAgent}>New Analysis</button>
          </div>
        </div>

        <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          {/* Chat Messages */}
          <div className="agent-chat-container card">
            <div className="agent-chat-messages">
              {visibleMessages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isProcessing && (
                <div className="agent-typing-indicator">
                  <div className="agent-typing-avatar">🤖</div>
                  <div className="agent-typing-bubble">
                    <div className="agent-typing-dots">
                      <span /><span /><span />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>
                      {agentSession?.status === 'using_tool' ? 'Using a tool...' : 'Thinking...'}
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area — active diagnosis questions */}
            {agentSession?.status === 'asking_user' && (
              <div className="agent-input-area">
                <div className="agent-input-hint">
                  The agent needs more information — you can attach a photo too
                </div>
                {questionImage && (
                  <div className="follow-up-image-preview">
                    <img src={questionImage} alt="Attached" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setQuestionImage(null)}>x</button>
                  </div>
                )}
                <div className="agent-input-row">
                  <input
                    ref={questionFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQuestionImage}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => questionFileRef.current?.click()}
                    title="Attach photo"
                    style={{ padding: '8px 10px', fontSize: 16 }}
                  >
                    📷
                  </button>
                  <input
                    className="input"
                    placeholder="Type your response..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && continueAgent()}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={continueAgent}
                    disabled={(!userInput.trim() && !questionImage) || isProcessing}
                  >
                    {isProcessing ? <span className="spinner" /> : 'Send'}
                  </button>
                </div>
              </div>
            )}

            {/* Follow-up chat — available after diagnosis or on error */}
            {(agentSession?.status === 'done' || agentSession?.status === 'error') && (
              <div className="agent-input-area">
                {followUpImage && (
                  <div className="follow-up-image-preview">
                    <img src={followUpImage} alt="Follow-up" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setFollowUpImage(null)}>x</button>
                  </div>
                )}
                <div className="agent-input-row">
                  <input
                    ref={followUpFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFollowUpImage}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => followUpFileRef.current?.click()}
                    title="Attach photo"
                    style={{ padding: '8px 10px', fontSize: 16 }}
                  >
                    📷
                  </button>
                  <input
                    ref={followUpInputRef}
                    className="input"
                    placeholder={agentSession?.status === 'error' ? 'Try again, add more details, or ask a question...' : 'Ask about the diagnosis, treatments, timeline...'}
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()}
                    style={{ flex: 1 }}
                    disabled={isProcessing}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={sendFollowUp}
                    disabled={(!followUpInput.trim() && !followUpImage) || isProcessing}
                  >
                    {isProcessing ? <span className="spinner" /> : 'Ask'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div className="layout-split-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {imagePreview && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 8 }}>Plant Photo</div>
                <img
                  src={imagePreview}
                  alt="Plant"
                  style={{ width: '100%', borderRadius: 'var(--radius)', objectFit: 'contain', maxHeight: 250 }}
                />
              </div>
            )}

            {/* Structured Observations */}
            {agentSession?.structuredObservations && agentSession.structuredObservations.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 8 }}>Known Facts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {agentSession.structuredObservations
                    .filter((o) => !o.key.startsWith('symptom:'))
                    .map((obs, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {obs.key.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontWeight: 500 }}>{obs.value}</span>
                      </div>
                    ))}
                  {agentSession.structuredObservations.some((o) => o.key.startsWith('symptom:')) && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Symptoms:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {agentSession.structuredObservations
                          .filter((o) => o.key.startsWith('symptom:'))
                          .map((obs, i) => (
                            <span key={i} style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 10,
                              background: 'var(--warning-dim, rgba(245,158,11,0.1))',
                              color: 'var(--warning)',
                            }}>
                              {obs.key.replace('symptom:', '')}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Diagnosis Summary (when done) */}
            {agentSession?.status === 'done' && agentSession.result && (
              <div className="card" style={{ borderColor: 'var(--success)' }}>
                <div className="card-title" style={{ marginBottom: 8, color: 'var(--success)' }}>
                  Diagnosis Complete
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {agentSession.result.diagnosis}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Health Score: {agentSession.result.healthScore}/100 &middot; {agentSession.result.urgency} urgency
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {agentSession.result.summary}
                </div>
              </div>
            )}

            {/* Council Review (when available) */}
            {agentSession?.councilReview && (
              <div className="card" style={{ borderColor: agentSession.councilReview.approved ? 'var(--success)' : 'var(--warning)' }}>
                <div className="card-title" style={{ marginBottom: 8, color: agentSession.councilReview.approved ? 'var(--success)' : 'var(--warning)' }}>
                  {agentSession.councilReview.approved ? '✅' : '⚠️'} Council Review
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {agentSession.councilReview.approved ? 'Approved' : 'Needs Revision'} — {agentSession.councilReview.confidence}% agreement
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {agentSession.councilReview.reviewerComments.map((r, i) => (
                    <div key={i} style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--bg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span>{r.emoji}</span>
                      <span style={{ fontWeight: 500 }}>{r.personaName}</span>
                      <span className={`badge ${r.vote === 'agree' ? 'badge-green' : r.vote === 'disagree' ? 'badge-red' : 'badge-yellow'}`} style={{ marginLeft: 'auto', fontSize: 9 }}>
                        {r.vote}
                      </span>
                    </div>
                  ))}
                </div>
                {agentSession.councilReview.corrections.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--info)' }}>
                    {agentSession.councilReview.corrections.length} correction(s) suggested
                  </div>
                )}
              </div>
            )}

            {/* Hypotheses */}
            {agentSession?.hypotheses && agentSession.hypotheses.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Hypotheses</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {agentSession.hypotheses
                    .filter((h) => h.status === 'active' || h.status === 'confirmed')
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, 5)
                    .map((hyp) => (
                      <div key={hyp.id} style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius)',
                        background: hyp.status === 'confirmed' ? 'var(--success-dim, rgba(34,197,94,0.1))' : 'var(--bg-tertiary)',
                        borderLeft: `3px solid ${hyp.status === 'confirmed' ? 'var(--success)' : hyp.confidence >= 60 ? 'var(--accent)' : 'var(--border)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{hyp.label}</span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: hyp.confidence >= 60 ? 'var(--accent-dim, rgba(99,102,241,0.15))' : 'var(--bg-secondary)',
                            color: hyp.confidence >= 60 ? 'var(--accent)' : 'var(--text-muted)',
                          }}>
                            {hyp.confidence}%
                          </span>
                        </div>
                        {hyp.supportingEvidence.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {hyp.supportingEvidence.slice(-2).map((e, i) => (
                              <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  {agentSession.hypotheses.filter((h) => h.status === 'ruled_out').length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {agentSession.hypotheses.filter((h) => h.status === 'ruled_out').length} ruled out
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Agent Activity */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Agent Activity</div>
              <div className="agent-activity-log">
                {/* Evidence log entries */}
                {agentSession?.evidenceLog && agentSession.evidenceLog.length > 0 && (
                  agentSession.evidenceLog.map((ev, i) => (
                    <div key={`ev-${i}`} className="agent-activity-item">
                      <span className="agent-activity-tool">{ev.toolName}</span>
                      <span className="agent-activity-summary" style={{ fontSize: 11 }}>
                        {ev.summary.substring(0, 60)}{ev.summary.length > 60 ? '...' : ''}
                      </span>
                    </div>
                  ))
                )}
                {/* Plan and reflection messages */}
                {agentSession?.messages
                  .filter((m) => m.role === 'plan' || m.role === 'reflection' || (m.role === 'system' && !m.internal))
                  .map((m) => {
                    if (m.role === 'system') {
                      return (
                        <div key={m.id} className="agent-activity-item agent-activity-system">
                          {m.content.substring(0, 80)}{m.content.length > 80 ? '...' : ''}
                        </div>
                      );
                    }
                    if (m.role === 'plan') {
                      return (
                        <div key={m.id} className="agent-activity-item agent-activity-plan">
                          Plan: {m.content.substring(0, 60)}{m.content.length > 60 ? '...' : ''}
                        </div>
                      );
                    }
                    if (m.role === 'reflection') {
                      return (
                        <div key={m.id} className="agent-activity-item agent-activity-reflection">
                          Reflection: {m.content.substring(0, 60)}{m.content.length > 60 ? '...' : ''}
                        </div>
                      );
                    }
                    return null;
                  })}
                {agentSession?.status === 'thinking' && (
                  <div className="agent-activity-item">
                    <span className="spinner" style={{ width: 12, height: 12 }} />
                    <span>Reasoning...</span>
                  </div>
                )}
                {agentSession?.status === 'using_tool' && (
                  <div className="agent-activity-item" style={{ color: 'var(--accent)' }}>
                    <span className="spinner" style={{ width: 12, height: 12 }} />
                    <span>Using tool...</span>
                  </div>
                )}
                {agentSession?.status === 'error' && (
                  <div className="agent-activity-item agent-activity-system">
                    Agent error — check chat for details
                  </div>
                )}
                {(!agentSession?.evidenceLog?.length &&
                  !agentSession?.messages.some(m => m.role === 'plan' || m.role === 'reflection' || (m.role === 'system' && !m.internal)) &&
                  agentSession?.status !== 'thinking' && agentSession?.status !== 'using_tool' && agentSession?.status !== 'error') && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    No activity yet
                  </div>
                )}
              </div>
            </div>

            {/* Pending Questions */}
            {agentSession?.pendingQuestions && agentSession.pendingQuestions.length > 0 && (
              <div className="card" style={{ borderColor: 'var(--warning)' }}>
                <div className="card-title" style={{ marginBottom: 8, color: 'var(--warning)' }}>
                  Questions for You
                </div>
                {agentSession.pendingQuestions.map((q, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {q}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: Result View ---
  if (viewMode === 'result' && agentSession?.result) {
    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Agent Diagnosis</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Completed in {agentSession.toolCalls} tool calls
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setViewMode('chat')}>
              Back to Chat
            </button>
            <button className="btn btn-secondary" onClick={resetAgent}>New Analysis</button>
          </div>
        </div>

        <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div>
            <AnalysisReportView result={agentSession.result} />
          </div>

          {/* Follow-up sidebar */}
          <div className="layout-split-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Ask Follow-Up</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Have questions about this diagnosis? Ask about treatments, timeline, alternatives, or anything else.
              </p>

              {/* Recent follow-up messages */}
              {agentSession.messages.filter((m) => m.role === 'user').length > 1 && (
                <div style={{ marginBottom: 12, maxHeight: 200, overflow: 'auto' }}>
                  {agentSession.messages
                    .filter((m) => m.role === 'agent' || m.role === 'user')
                    .slice(-6)
                    .map((m) => (
                      <div key={m.id} style={{
                        fontSize: 12,
                        padding: '6px 8px',
                        marginBottom: 4,
                        borderRadius: 'var(--radius)',
                        background: m.role === 'user' ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                          {m.role === 'user' ? 'You' : 'Doctor'}:
                        </span>{' '}
                        {m.content.substring(0, 120)}{m.content.length > 120 ? '...' : ''}
                      </div>
                    ))}
                </div>
              )}

              {followUpImage && (
                <div className="follow-up-image-preview">
                  <img src={followUpImage} alt="Follow-up" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setFollowUpImage(null)}>x</button>
                </div>
              )}

              <div className="agent-input-row">
                <input
                  ref={followUpFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFollowUpImage}
                  style={{ display: 'none' }}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => followUpFileRef.current?.click()}
                  title="Attach photo"
                  style={{ padding: '8px 10px', fontSize: 16 }}
                >
                  📷
                </button>
                <input
                  className="input"
                  placeholder="e.g. What if it doesn't improve?"
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()}
                  disabled={isProcessing}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendFollowUp}
                  disabled={(!followUpInput.trim() && !followUpImage) || isProcessing}
                >
                  {isProcessing ? <span className="spinner" /> : 'Ask'}
                </button>
              </div>
            </div>

            {/* Quick follow-up suggestions */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>Quick Questions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'What if the plant gets worse?',
                  'How long until recovery?',
                  'Are there organic alternatives?',
                  'Should I change the nutrients?',
                  'What should I watch for next?',
                ].map((q) => (
                  <button
                    key={q}
                    className="btn btn-ghost btn-sm"
                    style={{ justifyContent: 'flex-start', fontSize: 12, textAlign: 'left' }}
                    onClick={() => {
                      setFollowUpInput(q);
                      followUpInputRef.current?.focus();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// --- Chat Message Component ---

function ChatMessage({ message }: { message: AgentMessage }) {
  const [showThinking, setShowThinking] = useState(false);
  const [showToolDetails, setShowToolDetails] = useState(false);

  const timeStr = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.role === 'user') {
    return (
      <div className="agent-msg agent-msg-user">
        <div className="agent-msg-user-bubble">
          {message.imageData && (
            <img
              src={message.imageData}
              alt="Attached"
              className="agent-msg-image"
            />
          )}
          {message.content && (
            <div className="agent-msg-text">{message.content}</div>
          )}
          <div className="agent-msg-time">{timeStr}</div>
        </div>
        <div className="agent-msg-avatar agent-msg-avatar-user">You</div>
      </div>
    );
  }

  if (message.role === 'tool') {
    let toolLabel = message.toolName || 'tool';
    let toolSummary = '';
    let toolIcon = '🔧';
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.top_matches) {
        toolSummary = `${parsed.top_matches.length} matches found`;
        toolIcon = '🔍';
      }
      else if (parsed.checks) {
        toolSummary = `${parsed.checks.length} parameters checked`;
        toolIcon = '✅';
      }
      else if (parsed.found !== undefined) {
        toolSummary = parsed.found ? `Found: ${parsed.matches?.[0]?.name}` : 'Not found';
        toolIcon = parsed.found ? '✅' : '❌';
      }
      else if (parsed.locked_out_nutrients) {
        toolSummary = `${parsed.locked_out_nutrients.length} nutrients locked out`;
        toolIcon = '⚠️';
      }
      else if (parsed.status === 'diagnosis_complete') {
        toolSummary = 'Diagnosis generated';
        toolIcon = '📋';
      }
      else if (parsed.status === 'needs_more_info') {
        toolSummary = 'Requesting more info';
        toolIcon = '❓';
      }
      else toolSummary = 'Completed';
    } catch {
      toolSummary = message.content.substring(0, 60) + '...';
    }

    return (
      <div className="agent-msg agent-msg-tool">
        <div className="agent-tool-card" onClick={() => setShowToolDetails(!showToolDetails)}>
          <div className="agent-tool-header">
            <span className="agent-tool-icon">{toolIcon}</span>
            <span className="agent-tool-name">{toolLabel}</span>
            <span className="agent-tool-arrow">{showToolDetails ? '▾' : '▸'}</span>
          </div>
          <div className="agent-tool-summary">{toolSummary}</div>
          {showToolDetails && (
            <pre className="agent-tool-details">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(message.content), null, 2);
                } catch {
                  return message.content;
                }
              })()}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'system') {
    return (
      <div className="agent-msg agent-msg-system">
        <div className="agent-system-card">
          {message.content}
        </div>
      </div>
    );
  }

  // Agent message
  return (
    <div className="agent-msg agent-msg-agent">
      <div className="agent-msg-avatar">🤖</div>
      <div className="agent-msg-content">
        {(message.content || message.thinking) && (
          <div className="agent-msg-bubble">
            {message.thinking && (
              <div className="agent-thinking-toggle">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowThinking(!showThinking)}
                  style={{ fontSize: 11, padding: '2px 6px' }}
                >
                  {showThinking ? '▾' : '▸'} thinking
                </button>
                {showThinking && (
                  <div className="agent-thinking-content">
                    {message.thinking}
                  </div>
                )}
              </div>
            )}
            {message.content && (
              <MarkdownContent content={message.content} />
            )}
            <CopyButton text={message.content} />
            <div className="agent-msg-time">{timeStr}</div>
          </div>
        )}
      </div>
    </div>
  );
}
