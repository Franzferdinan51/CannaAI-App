import { useState, useRef, useEffect } from 'react';
import type {
  ProviderConfig,
  AnalysisParams,
  PlantAnalysisResult,
  GrowthStage,
  AnalysisReport,
} from '../types';
import { generateAnalysisPrompt, extractJSONFromResponse, validateAndFillDefaults } from '../services/analysis';
import { executeWithFallback } from '../services/ai-providers';
import { loadJSON, loadTemperatureUnit } from '../utils/storage';
import { AnalysisReport as AnalysisReportView } from './AnalysisReport';
import { GROWTH_STAGES, COMMON_MEDIA, COMMON_SYMPTOMS } from '../constants';

const REPORTS_KEY = 'cannaai_analysis_reports';

const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.8;

function compressImage(dataUrl: string): Promise<{ compressed: string; originalSize: number; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if larger than max dimension
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
      const compressed = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);

      // Approximate base64 sizes in bytes
      const originalSize = Math.round((dataUrl.length * 3) / 4);
      const compressedSize = Math.round((compressed.length * 3) / 4);

      resolve({ compressed, originalSize, compressedSize });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  providers: ProviderConfig[];
}

export function PlantAnalysis({ providers }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [params, setParams] = useState<AnalysisParams>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<PlantAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [reports, setReports] = useState<AnalysisReport[]>(() => {
    try {
      const raw = localStorage.getItem(REPORTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [tempUnit] = useState<'C' | 'F'>(() => loadTemperatureUnit());

  useEffect(() => {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  }, [reports]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setCompressionInfo(null);

      // Always convert to JPEG — ensures WEBP/other formats work on all providers
      // (LM Studio's llama.cpp backend only supports JPEG/PNG for vision)
      setIsCompressing(true);
      try {
        const { compressed, originalSize: origSize, compressedSize } = await compressImage(dataUrl);
        setImagePreview(compressed);
        setParams((prev) => ({ ...prev, image: compressed }));
        if (compressedSize < origSize * 0.9) {
          setCompressionInfo(`${formatBytes(origSize)} → ${formatBytes(compressedSize)}`);
        }
      } catch {
        // Fall back to original if conversion fails
        setParams((prev) => ({ ...prev, image: dataUrl }));
      } finally {
        setIsCompressing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setParams((prev) => ({ ...prev, image: undefined }));
    setCompressionInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSymptom = (symptom: string) => {
    setParams((prev) => {
      const current = prev.symptoms || [];
      const updated = current.includes(symptom)
        ? current.filter((s) => s !== symptom)
        : [...current, symptom];
      return { ...prev, symptoms: updated };
    });
  };

  const analyze = async () => {
    if (!params.image && !params.symptoms?.length && !params.notes) {
      setError('Please provide an image, symptoms, or notes for analysis.');
      return;
    }

    const activeProviders = providers.filter(
      (p) => (params.image ? p.visionModel : p.textModel)
    );
    if (activeProviders.length === 0) {
      setError('No providers configured. Please add a provider in Settings.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setRawResponse(null);

    try {
      const prompt = generateAnalysisPrompt(params);
      const analysisTimeout = loadJSON('cannaai-analysis-timeout', 300000);
      const response = await executeWithFallback(providers, {
        prompt,
        image: params.image,
        systemPrompt: 'You are CannaAI — an expert cannabis diagnostician. You MUST respond with ONLY a single valid JSON object. Do NOT include any text before or after the JSON. Do NOT use markdown code fences. Do NOT add explanations. Start your response with { and end with }. The JSON must match the schema provided in the user message.',
        useVision: true,
        temperature: 0.3,
        maxTokens: 4096,
        responseFormat: 'json',
        timeout: analysisTimeout,
      });

      if (!response.success) {
        setError(response.error || 'Analysis failed. Please check your provider settings.');
        return;
      }

      setRawResponse(response.content);

      const extracted = extractJSONFromResponse(response.content);
      if (extracted.success && extracted.data) {
        const validated = validateAndFillDefaults(extracted.data);
        setResult(validated);

        // Save to history
        const report: AnalysisReport = {
          id: `report-${Date.now()}`,
          timestamp: Date.now(),
          params,
          result: validated,
          provider: response.provider,
          model: response.model,
          councilUsed: false,
        };
        setReports((prev) => [report, ...prev].slice(0, 20));
      } else {
        setError(`AI response didn't contain valid JSON (parsing strategy: ${extracted.method}). This usually means the model returned explanation text instead of JSON. Try a different model or check the raw response below.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const hasProvider = providers.some((p) => p.textModel || p.visionModel);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Plant Analysis</h2>
        <p>Upload a plant photo and/or describe symptoms for AI-powered diagnosis.</p>
      </div>

      <div className="layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left: Input Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Image Upload */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Plant Photo</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            {imagePreview ? (
              <div className="image-upload-area has-image" onClick={() => fileInputRef.current?.click()}>
                <img src={imagePreview} alt="Plant" className="preview-img" />
                {isCompressing && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span className="spinner" /> Compressing image...
                  </div>
                )}
                {compressionInfo && !isCompressing && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                    Optimized: {compressionInfo}
                  </div>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage();
                  }}
                >
                  Remove Image
                </button>
              </div>
            ) : (
              <div className="image-upload-area" onClick={() => fileInputRef.current?.click()}>
                <div className="upload-icon">📷</div>
                <div className="upload-text">Click to upload a plant photo</div>
                <div className="upload-hint">JPG, PNG, WebP — images are auto-optimized for faster analysis</div>
              </div>
            )}
          </div>

          {/* Plant Details */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Plant Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label>Strain</label>
                  <input
                    className="input"
                    placeholder="e.g. Blue Dream"
                    value={params.strain || ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, strain: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Growth Stage</label>
                  <select
                    className="select"
                    value={params.growthStage || ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, growthStage: e.target.value as GrowthStage || undefined }))}
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
                  onChange={(e) => setParams((prev) => ({ ...prev, medium: e.target.value || undefined }))}
                >
                  <option value="">-- Select --</option>
                  {COMMON_MEDIA.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
                    onChange={(e) => setParams((prev) => ({ ...prev, phLevel: e.target.value ? parseFloat(e.target.value) : undefined }))}
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
                    onChange={(e) => setParams((prev) => ({ ...prev, temperature: e.target.value ? parseFloat(e.target.value) : undefined }))}
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
                    onChange={(e) => setParams((prev) => ({ ...prev, humidity: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Symptoms */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Observed Symptoms</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {COMMON_SYMPTOMS.map((symptom) => (
                <button
                  key={symptom}
                  className={`btn btn-sm ${params.symptoms?.includes(symptom) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleSymptom(symptom)}
                >
                  {symptom}
                </button>
              ))}
            </div>
            <div className="input-group">
              <label>Additional Notes</label>
              <textarea
                className="textarea"
                placeholder="Describe any additional observations, growing conditions, recent changes..."
                value={params.notes || ''}
                onChange={(e) => setParams((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          {/* Analyze Button */}
          <button
            className="btn btn-primary btn-lg"
            onClick={analyze}
            disabled={isAnalyzing || !hasProvider}
            style={{ width: '100%' }}
          >
            {isAnalyzing ? (
              <>
                <span className="spinner" /> Analyzing Plant...
              </>
            ) : (
              <>🌿 Analyze Plant Health</>
            )}
          </button>

          {!hasProvider && (
            <div style={{ fontSize: 13, color: 'var(--warning)', textAlign: 'center' }}>
              Configure a provider with a model in Settings to start analyzing.
            </div>
          )}

          {error && (
            <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 13 }}>
              {error}
              {rawResponse && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Show raw response</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8, color: 'var(--text-muted)', maxHeight: 300, overflow: 'auto' }}>
                    {rawResponse}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div>
          {isAnalyzing && (
            <div className="card">
              <div className="loading-overlay">
                <div className="spinner spinner-lg" />
                <span>AI is analyzing your plant...</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>This may take a few minutes — please be patient</span>
              </div>
            </div>
          )}

          {result && !isAnalyzing && <AnalysisReportView result={result} />}

          {!result && !isAnalyzing && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
              <h3 style={{ marginBottom: 8 }}>No Analysis Yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Upload a photo and/or describe symptoms, then click Analyze.
              </p>
            </div>
          )}

          {/* Analysis History */}
          {reports.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <div className="card-title">Analysis History ({reports.length})</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                      onClick={() => setResult(r.result)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>{r.result.diagnosis}</span>
                        <span className={`badge ${r.result.urgency === 'low' ? 'badge-green' : r.result.urgency === 'medium' ? 'badge-yellow' : 'badge-red'}`}>
                          {r.result.urgency}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                        Score: {r.result.healthScore}/100 &middot; {r.provider} &middot; {new Date(r.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
