import { useState, useRef, useEffect } from 'react';
import type { ProviderConfig, CouncilMessage, CouncilSession, SessionMode, CouncilVoteResult, PlantAnalysisResult, GroupDeliberationResult } from '../types';
import { COUNCIL_PERSONAS, PERSONA_GROUPS, TEAM_TEMPLATES, runCouncilSession, quickCouncilConsult } from '../services/council';
import { runTeamFromTemplate, councilReviewDiagnosis, type CouncilReviewResult, type TeamResult } from '../services/team-orchestrator';
import { MarkdownContent, CopyButton } from './MarkdownContent';

const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.8;

/** Convert any image (WEBP, PNG, etc.) to JPEG data URL for universal provider support. */
function normalizeImageToJpeg(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
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

const QUICK_CONSULT_VERDICT_PROMPT = `After your analysis, append a JSON verdict block on a new line (no markdown wrapping):
===VERDICT===
{"recommendation":"<one sentence overall recommendation>","confidence":<0-100>,"urgency":"low|medium|high|critical","keyActions":["<action 1>","<action 2>","<action 3>"]}
===END===`;

interface Props {
  providers: ProviderConfig[];
}

const SESSION_MODES: { value: SessionMode; label: string; desc: string }[] = [
  { value: 'deliberation', label: 'Deliberation', desc: 'Structured debate with independent analysis' },
  { value: 'advisory', label: 'Advisory', desc: 'Each expert gives their recommendation' },
  { value: 'consensus', label: 'Consensus', desc: 'Council works toward unified recommendation' },
  { value: 'adversarial', label: 'Adversarial', desc: 'Challenge assumptions, find flaws' },
  { value: 'brainstorm', label: 'Brainstorm', desc: 'Creative solutions and novel approaches' },
  { value: 'risk-assessment', label: 'Risk Assessment', desc: 'Identify and rate risks from each specialty' },
  { value: 'peer-review', label: 'Peer Review', desc: 'Review and critique for accuracy' },
  { value: 'swarm', label: 'Swarm', desc: 'Each member contributes one key insight — collective intelligence' },
  { value: 'socratic', label: 'Socratic', desc: 'Challenge assumptions with probing questions before answering' },
  { value: 'emergency', label: 'Emergency', desc: 'Speed over perfection — identify threats and act now' },
  { value: 'proposal', label: 'Proposal', desc: 'Evaluate a proposal — each member votes approve/reject/conditional' },
  { value: 'vision', label: 'Vision', desc: 'Analyze attached images with visual pattern recognition' },
  { value: 'strategic', label: 'Strategic', desc: 'Long-term planning with phased action plans' },
  { value: 'multi-model', label: 'Multi-Model', desc: 'Groups deliberate in parallel, synthesized into unified verdict' },
];

export function CouncilChamber({ providers }: Props) {
  const [activeTab, setActiveTab] = useState<'quick' | 'full' | 'team' | 'review'>('quick');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<SessionMode>('deliberation');
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(
    COUNCIL_PERSONAS.map((p) => p.id)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<CouncilMessage[]>([]);
  const [votes, setVotes] = useState<CouncilVoteResult | null>(null);
  const [quickResponse, setQuickResponse] = useState<string | null>(null);
  const [quickVerdict, setQuickVerdict] = useState<{ recommendation: string; confidence: number; urgency: string; keyActions: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CouncilSession[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | undefined>(undefined);
  const [selectedTeam, setSelectedTeam] = useState<string>('diagnosis');
  const [teamResult, setTeamResult] = useState<TeamResult | null>(null);
  const [reviewDiagnosis, setReviewDiagnosis] = useState<string>('');
  const [reviewResult, setReviewResult] = useState<CouncilReviewResult | null>(null);
  const [groupResults, setGroupResults] = useState<GroupDeliberationResult[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const jpeg = await normalizeImageToJpeg(dataUrl);
        setImagePreview(jpeg);
        setImageData(jpeg);
      } catch {
        setImagePreview(dataUrl);
        setImageData(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageData(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasProvider = providers.some((p) => (imageData ? p.visionModel || p.textModel : p.textModel));

  const togglePersona = (id: string) => {
    setSelectedPersonas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedPersonas(COUNCIL_PERSONAS.map((p) => p.id));
  const selectNone = () => setSelectedPersonas([]);

  const runFullSession = async () => {
    if (!topic.trim() || selectedPersonas.length === 0) return;

    setIsRunning(true);
    setError(null);
    setMessages([]);
    setVotes(null);
    setGroupResults([]);

    try {
      const session = await runCouncilSession({
        topic,
        mode,
        selectedPersonaIds: selectedPersonas,
        providers,
        image: imageData,
        onMessage: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
      });

      setVotes(session.votes || null);
      if (session.multiModelResult) {
        setGroupResults(session.multiModelResult.groupResults);
      }
      setSessions((prev) => [session, ...prev].slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Council session failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const runQuickConsult = async () => {
    if (!topic.trim()) return;

    setIsRunning(true);
    setError(null);
    setQuickResponse(null);
    setQuickVerdict(null);

    try {
      const response = await quickCouncilConsult({
        question: topic + '\n\n' + QUICK_CONSULT_VERDICT_PROMPT,
        providers,
        image: imageData,
      });
      // Extract verdict JSON if present
      const verdictMatch = response.match(/===VERDICT===\s*(\{[\s\S]*?\})\s*===END===/);
      if (verdictMatch) {
        try {
          setQuickVerdict(JSON.parse(verdictMatch[1]));
          setQuickResponse(response.replace(/===VERDICT===[\s\S]*?===END===/, '').trim());
        } catch {
          setQuickResponse(response);
        }
      } else {
        setQuickResponse(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick consultation failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const runTeamConsult = async () => {
    if (!topic.trim()) return;

    setIsRunning(true);
    setError(null);
    setTeamResult(null);
    setMessages([]);

    try {
      const result = await runTeamFromTemplate({
        templateId: selectedTeam,
        topic,
        providers,
        image: imageData,
        onMessage: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
      });
      setTeamResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Team consultation failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const runDiagnosisReview = async () => {
    if (!reviewDiagnosis.trim()) return;

    setIsRunning(true);
    setError(null);
    setReviewResult(null);
    setMessages([]);

    try {
      // Parse the diagnosis text into a minimal PlantAnalysisResult
      const diagnosis: PlantAnalysisResult = {
        diagnosis: reviewDiagnosis.split('\n')[0] || reviewDiagnosis.substring(0, 100),
        summary: reviewDiagnosis,
        urgency: 'medium',
        urgencyReasons: [],
        healthScore: 50,
        healthScoreBreakdown: {
          vigor: { score: 50, rationale: 'Under review' },
          leafCondition: { score: 50, rationale: 'Under review' },
          pestFree: { score: 50, rationale: 'Under review' },
          environmentOptimal: { score: 50, rationale: 'Under review' },
          growthStageAppropriate: { score: 50, rationale: 'Under review' },
          rootHealth: { score: 50, rationale: 'Under review' },
        },
        likelyCauses: [],
        evidenceObservations: [],
        uncertainties: [],
        recommendations: { immediate: [], shortTerm: [], longTerm: [] },
        detectedIssues: [],
        confidence: 50,
        prognosis: '',
        followUpSchedule: '',
      };

      const result = await councilReviewDiagnosis({
        diagnosis,
        observations: [reviewDiagnosis],
        providers,
        image: imageData,
        onMessage: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
      });
      setReviewResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnosis review failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>AI Council Chamber</h2>
        <p>Consult the 6-member CannaAI expert council for multi-perspective analysis.</p>
      </div>

      {/* Tab Toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius)', width: 'fit-content', flexWrap: 'wrap' }}>
        {([
          { id: 'quick' as const, label: 'Quick Consult', icon: '🧠' },
          { id: 'full' as const, label: 'Full Session', icon: '🏛️' },
          { id: 'team' as const, label: 'Team Analysis', icon: '👥' },
          { id: 'review' as const, label: 'Review Diagnosis', icon: '🔍' },
        ]).map((tab) => (
          <button
            key={tab.id}
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: activeTab === 'full' ? '1fr 340px' : '1fr', gap: 24, alignItems: 'start' }}>
        {/* Main Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Topic Input */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>
              {activeTab === 'quick' ? 'Ask the Council' :
               activeTab === 'team' ? 'Team Analysis Topic' :
               activeTab === 'review' ? 'Diagnosis to Review' :
               'Session Topic'}
            </div>
            {activeTab === 'review' ? (
              <textarea
                className="textarea"
                placeholder="Paste or describe the diagnosis you want reviewed... e.g., 'Nitrogen deficiency with 65 health score, urgency medium. Recommend increasing nitrogen feeding and checking pH...'"
                value={reviewDiagnosis}
                onChange={(e) => setReviewDiagnosis(e.target.value)}
                rows={4}
              />
            ) : (
              <textarea
                className="textarea"
                placeholder={
                  activeTab === 'quick'
                    ? 'Ask a cannabis growing question... e.g., "My plant leaves are yellowing from the bottom up, what could be wrong?"'
                    : activeTab === 'team'
                    ? 'Describe the analysis task for the team... e.g., "Diagnose yellowing leaves on my flowering Blue Dream in coco"'
                    : 'Describe the topic for council deliberation...'
                }
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
              />
            )}

            {/* Image Upload */}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Attach Photo (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              {imagePreview ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    style={{ maxWidth: 160, maxHeight: 120, borderRadius: 'var(--radius)', objectFit: 'cover', border: '1px solid var(--border)' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Photo attached</span>
                    <button className="btn btn-ghost btn-sm" onClick={removeImage}>Remove</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>Change</button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', borderStyle: 'dashed' }}
                >
                  📷 Click to upload a plant photo
                </button>
              )}
            </div>

            {activeTab === 'full' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Session Mode
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SESSION_MODES.map((m) => (
                    <button
                      key={m.value}
                      className={`btn btn-sm ${mode === m.value ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMode(m.value)}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'team' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                  Team Template
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TEAM_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      className={`btn btn-sm ${selectedTeam === t.id ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedTeam(t.id)}
                      title={t.description}
                    >
                      {t.emoji} {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={
                  activeTab === 'quick' ? runQuickConsult :
                  activeTab === 'team' ? runTeamConsult :
                  activeTab === 'review' ? runDiagnosisReview :
                  runFullSession
                }
                disabled={
                  isRunning ||
                  (activeTab === 'review' ? !reviewDiagnosis.trim() : !topic.trim()) ||
                  !hasProvider ||
                  (activeTab === 'full' && selectedPersonas.length === 0)
                }
                style={{ flex: 1 }}
              >
                {isRunning ? (
                  <>
                    <span className="spinner" />
                    {activeTab === 'quick' ? 'Consulting Council...' :
                     activeTab === 'team' ? 'Running Team Analysis...' :
                     activeTab === 'review' ? 'Reviewing Diagnosis...' :
                     'Running Session...'}
                  </>
                ) : (
                  <>
                    {activeTab === 'quick' ? '🧠 Quick Council Consult' :
                     activeTab === 'team' ? '👥 Run Team Analysis' :
                     activeTab === 'review' ? '🔍 Review Diagnosis' :
                     '▶️ Run Full Session'}
                  </>
                )}
              </button>
            </div>

            {!hasProvider && (
              <div style={{ fontSize: 13, color: 'var(--warning)', marginTop: 8 }}>
                Configure a provider with a text model in Settings to use the council.
              </div>
            )}
          </div>

          {/* Quick Response */}
          {activeTab === 'quick' && quickResponse && !isRunning && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>
                🧠 Council Response
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', position: 'relative' }}>
                <MarkdownContent content={quickResponse} />
                <CopyButton text={quickResponse} />
              </div>
            </div>
          )}

          {/* Quick Consult Verdict Card */}
          {activeTab === 'quick' && quickVerdict && !isRunning && (
            <div className="card" style={{ borderLeft: `4px solid ${quickVerdict.urgency === 'critical' ? 'var(--danger)' : quickVerdict.urgency === 'high' ? 'var(--warning)' : quickVerdict.urgency === 'medium' ? 'var(--info)' : 'var(--success)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 36 }}>
                  {quickVerdict.urgency === 'critical' ? '🚨' : quickVerdict.urgency === 'high' ? '⚠️' : quickVerdict.urgency === 'medium' ? '📋' : '✅'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="card-title" style={{ marginBottom: 4 }}>Council Verdict</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{quickVerdict.recommendation}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{quickVerdict.confidence}%</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: quickVerdict.keyActions.length > 0 ? 12 : 0 }}>
                <span className={`badge ${quickVerdict.urgency === 'critical' || quickVerdict.urgency === 'high' ? 'badge-red' : quickVerdict.urgency === 'medium' ? 'badge-yellow' : 'badge-green'}`}>
                  {quickVerdict.urgency} urgency
                </span>
              </div>
              {quickVerdict.keyActions.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Key Actions</div>
                  {quickVerdict.keyActions.map((action, i) => (
                    <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent)' }}>
                      {action}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Team Result */}
          {activeTab === 'team' && teamResult && !isRunning && (
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 40 }}>👥</div>
                <div style={{ flex: 1 }}>
                  <div className="card-title" style={{ marginBottom: 4 }}>{teamResult.teamName} Results</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {teamResult.messages.length} responses &middot; Consensus: {teamResult.consensus}%
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Tasks Completed</div>
                {teamResult.tasks.map((task) => (
                  <div key={task.id} style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: task.status === 'completed' ? 'var(--success)' : 'var(--text-dim)' }}>
                      {task.status === 'completed' ? '✓' : '○'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{task.label}</span>
                  </div>
                ))}
              </div>

              {/* Synthesis */}
              <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Synthesis</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, position: 'relative' }}>
                  <MarkdownContent content={teamResult.synthesis} />
                  <CopyButton text={teamResult.synthesis} />
                </div>
              </div>

              {/* Recommendations */}
              {teamResult.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Recommendations</div>
                  {teamResult.recommendations.map((rec, i) => (
                    <div key={i} style={{ padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent)' }}>
                      {rec}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Review Result */}
          {activeTab === 'review' && reviewResult && !isRunning && (
            <div className="card" style={{ borderLeft: `4px solid ${reviewResult.approved ? 'var(--success)' : 'var(--warning)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 40 }}>
                  {reviewResult.approved ? '✅' : '⚠️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="card-title" style={{ marginBottom: 4 }}>Council Review</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: reviewResult.approved ? 'var(--success)' : 'var(--warning)' }}>
                    {reviewResult.approved ? 'Approved' : 'Needs Revision'} — {reviewResult.confidence}% agreement
                  </div>
                </div>
              </div>

              {/* Reviewer Votes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Reviewer Votes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reviewResult.reviewerComments.map((r, i) => (
                    <div key={i} style={{
                      padding: '10px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius)',
                      borderLeft: `3px solid ${r.vote === 'agree' ? 'var(--success)' : r.vote === 'disagree' ? 'var(--danger)' : 'var(--warning)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{r.emoji} {r.personaName}</span>
                        <span className={`badge ${r.vote === 'agree' ? 'badge-green' : r.vote === 'disagree' ? 'badge-red' : 'badge-yellow'}`}>
                          {r.vote}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {r.comment.substring(0, 200)}{r.comment.length > 200 ? '...' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              {(reviewResult.strengths.length > 0 || reviewResult.weaknesses.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {reviewResult.strengths.length > 0 && (
                    <div style={{ padding: 10, background: 'rgba(34,197,94,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>Strengths</div>
                      {reviewResult.strengths.map((s, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>+ {s}</div>
                      ))}
                    </div>
                  )}
                  {reviewResult.weaknesses.length > 0 && (
                    <div style={{ padding: 10, background: 'rgba(255,167,38,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,167,38,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>Weaknesses</div>
                      {reviewResult.weaknesses.map((w, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>- {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Corrections */}
              {reviewResult.corrections.length > 0 && (
                <div style={{ padding: 10, background: 'rgba(66,165,245,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(66,165,245,0.15)', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--info)', marginBottom: 6 }}>Suggested Corrections</div>
                  {reviewResult.corrections.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>→ {c}</div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {reviewResult.summary}
                </div>
              </div>
            </div>
          )}

          {/* Team/Review Deliberation Messages */}
          {(activeTab === 'team' || activeTab === 'review') && messages.length > 0 && (
            <div className="card" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <div className="card-title" style={{ marginBottom: 16, position: 'sticky', top: 0, background: 'var(--bg-card)', paddingBottom: 8, zIndex: 1 }}>
                {isRunning ? (
                  <>{activeTab === 'team' ? 'Team Deliberation' : 'Council Review'} ({messages.length} responses) <span className="spinner" style={{ marginLeft: 8 }} /></>
                ) : (
                  <>{activeTab === 'team' ? 'Team Deliberation' : 'Council Review'} ({messages.length} responses)</>
                )}
              </div>
              {messages.map((msg) => {
                const persona = COUNCIL_PERSONAS.find((p) => p.id === msg.personaId);
                return (
                  <div
                    key={msg.id}
                    className="council-message"
                    style={{ borderLeftColor: persona?.color || 'var(--accent)' }}
                  >
                    <div className="council-message-header">
                      <span className="persona-emoji">{msg.personaEmoji}</span>
                      <span className="persona-name">{msg.personaName}</span>
                      {persona && (
                        <span className="persona-role" style={{ color: persona.color }}>{persona.role}</span>
                      )}
                    </div>
                    <div className="council-message-body">
                      <MarkdownContent content={msg.content} />
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Full Session Messages — shows during AND after the run */}
          {activeTab === 'full' && messages.length > 0 && (
            <div className="card" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <div className="card-title" style={{ marginBottom: 16, position: 'sticky', top: 0, background: 'var(--bg-card)', paddingBottom: 8, zIndex: 1 }}>
                {isRunning ? (
                  <>Council Deliberation ({messages.length}/{selectedPersonas.length} responses) <span className="spinner" style={{ marginLeft: 8 }} /></>
                ) : (
                  <>Council Deliberation ({messages.length}/{selectedPersonas.length} responses)</>
                )}
              </div>
              {messages.map((msg) => {
                const persona = COUNCIL_PERSONAS.find((p) => p.id === msg.personaId);
                const isFailed = msg.content.startsWith('[Unable to reach');
                return (
                  <div
                    key={msg.id}
                    className="council-message"
                    style={{ borderLeftColor: isFailed ? 'var(--danger)' : persona?.color || 'var(--accent)', opacity: isFailed ? 0.7 : 1 }}
                  >
                    <div className="council-message-header">
                      <span className="persona-emoji">{msg.personaEmoji}</span>
                      <span className="persona-name">{msg.personaName}</span>
                      {persona && (
                        <span className="persona-role" style={{ color: persona.color }}>{persona.role}</span>
                      )}
                      {isFailed && (
                        <span className="badge badge-red" style={{ marginLeft: 'auto' }}>Failed</span>
                      )}
                    </div>
                    <div className="council-message-body">
                      {isFailed ? (
                        <div style={{ fontSize: 13, color: 'var(--danger)', fontStyle: 'italic' }}>
                          {msg.content}
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                            Check that your provider has a {imageData ? 'vision' : 'text'} model configured and is reachable. If the error mentions timeouts or rate limits, try again — transient failures are retried automatically.
                          </div>
                        </div>
                      ) : (
                        <MarkdownContent content={msg.content} />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Verdict Card */}
          {activeTab === 'full' && votes && !isRunning && (() => {
            const failedCount = messages.filter((m) => m.content.startsWith('[Unable to reach')).length;
            const successCount = messages.length - failedCount;
            const majorityPct = Math.max(votes.agree, votes.disagree, votes.abstain);
            const verdictUrgency = votes.agree >= 60 ? 'low' : votes.disagree >= 50 ? 'high' : 'medium';
            return (
              <div className="card" style={{ borderLeft: `4px solid ${verdictUrgency === 'high' ? 'var(--danger)' : verdictUrgency === 'medium' ? 'var(--warning)' : 'var(--success)'}` }}>
                {/* Verdict Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 40 }}>
                    {verdictUrgency === 'high' ? '🚨' : verdictUrgency === 'medium' ? '⚠️' : '✅'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="card-title" style={{ marginBottom: 4 }}>Council Verdict</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {votes.consensus}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 72 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{majorityPct}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {votes.agree >= votes.disagree ? 'Agreement' : 'Dissent'}
                    </div>
                  </div>
                </div>

                {/* Response Stats */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
                  <span className="badge badge-green">{successCount} responded</span>
                  {failedCount > 0 && <span className="badge badge-red">{failedCount} failed</span>}
                </div>

                {/* Vote Breakdown */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Vote Breakdown</div>
                  <div className="vote-bar" style={{ marginBottom: 8 }}>
                    {votes.agree > 0 && (
                      <div className="vote-bar-segment agree" style={{ width: `${votes.agree}%` }}>
                        {votes.agree > 10 && `${votes.agree}%`}
                      </div>
                    )}
                    {votes.disagree > 0 && (
                      <div className="vote-bar-segment disagree" style={{ width: `${votes.disagree}%` }}>
                        {votes.disagree > 10 && `${votes.disagree}%`}
                      </div>
                    )}
                    {votes.abstain > 0 && (
                      <div className="vote-bar-segment abstain" style={{ width: `${votes.abstain}%` }}>
                        {votes.abstain > 10 && `${votes.abstain}%`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: 'var(--success)' }}>Agree: {votes.agree}%</span>
                    <span style={{ color: 'var(--danger)' }}>Disagree: {votes.disagree}%</span>
                    <span style={{ color: 'var(--text-dim)' }}>Abstain: {votes.abstain}%</span>
                  </div>
                </div>

                {/* Dissenting Views */}
                {votes.dissenting.length > 0 && (
                  <div style={{ padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 12, borderLeft: '3px solid var(--danger)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                      Dissenting Views
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{votes.dissenting.join(', ')}</div>
                  </div>
                )}

                {/* Synthesis */}
                <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Full Synthesis
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, position: 'relative' }}>
                    <MarkdownContent content={votes.synthesis} />
                    <CopyButton text={votes.synthesis} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Multi-Model Group Results */}
          {activeTab === 'full' && groupResults.length > 0 && !isRunning && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>
                🏛️ Group Deliberation Results ({groupResults.length} groups)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {groupResults.map((gr) => {
                  const groupInfo = PERSONA_GROUPS[gr.group];
                  return (
                    <div
                      key={gr.group}
                      style={{
                        padding: 14,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius)',
                        borderLeft: `4px solid ${groupInfo?.color || 'var(--accent)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 20 }}>{groupInfo?.emoji || '👥'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{gr.groupName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{gr.personas.join(', ')}</div>
                        </div>
                        <span className={`badge ${gr.vote === 'agree' ? 'badge-green' : gr.vote === 'disagree' ? 'badge-red' : 'badge-yellow'}`}>
                          {gr.vote}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                        <MarkdownContent content={gr.summary} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Confidence: <strong style={{ color: 'var(--accent)' }}>{gr.confidence}%</strong>
                        </div>
                      </div>
                      {gr.keyPoints.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Key Points</div>
                          {gr.keyPoints.map((kp, i) => (
                            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 8, borderLeft: '2px solid var(--border)', marginBottom: 3 }}>
                              {kp}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Session History */}
          {sessions.length > 0 && activeTab === 'full' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>
                Session History ({sessions.length})
              </div>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius)',
                    marginBottom: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  onClick={() => {
                    setMessages(s.messages);
                    setVotes(s.votes || null);
                    setTopic(s.topic);
                    setMode(s.mode);
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{s.topic}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                    {s.mode} &middot; {s.messages.length} responses &middot; {new Date(s.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel: Persona Selection (Full Session only) */}
        {activeTab === 'full' && (
          <div className="layout-split-side">
            <div className="card" style={{ position: 'sticky', top: 32 }}>
              <div className="card-header">
                <div className="card-title">
                  Council Members ({selectedPersonas.length}/{COUNCIL_PERSONAS.length})
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={selectAll}>All</button>
                  <button className="btn btn-ghost btn-sm" onClick={selectNone}>None</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COUNCIL_PERSONAS.map((persona) => (
                  <div
                    key={persona.id}
                    className={`persona-card ${selectedPersonas.includes(persona.id) ? 'selected' : ''}`}
                    onClick={() => togglePersona(persona.id)}
                    style={{ padding: 12 }}
                  >
                    <div className="persona-header">
                      <div className="persona-icon" style={{ fontSize: 20, width: 32, height: 32 }}>
                        {persona.emoji}
                      </div>
                      <div className="persona-info" style={{ flex: 1 }}>
                        <h4 style={{ fontSize: 13 }}>{persona.name}</h4>
                        <span style={{ fontSize: 10 }}>{persona.role}</span>
                      </div>
                      {selectedPersonas.includes(persona.id) && (
                        <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>
                      )}
                    </div>
                    <div className="expertise-tags">
                      {persona.expertise.slice(0, 3).map((exp) => (
                        <span key={exp} className="expertise-tag">{exp}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
