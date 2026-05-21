import type { PlantAnalysisResult } from '../types';

interface Props {
  result: PlantAnalysisResult;
}

export function AnalysisReport({ result }: Props) {
  const scoreClass = (score: number) =>
    score >= 70 ? 'good' : score >= 40 ? 'moderate' : 'poor';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div className={`health-score-ring ${scoreClass(result.healthScore)}`}>
            {result.healthScore}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{result.diagnosis}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{result.summary}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`urgency-indicator ${result.urgency}`}>
                {result.urgency === 'critical' ? '🚨' : result.urgency === 'high' ? '⚠️' : result.urgency === 'medium' ? '📋' : '✅'}{' '}
                {result.urgency}
              </span>
              <span className="badge badge-blue">Confidence: {result.confidence}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Urgency Reasons */}
      {result.urgencyReasons.length > 0 && (
        <div className="card analysis-section">
          <h4>Urgency Factors</h4>
          {result.urgencyReasons.map((reason, i) => (
            <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--warning)' }}>
              {reason}
            </div>
          ))}
        </div>
      )}

      {/* Health Score Breakdown */}
      <div className="card analysis-section">
        <h4>Health Score Breakdown</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(result.healthScoreBreakdown).map(([key, entry]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span style={{ fontWeight: 600 }}>{entry.score}/100</span>
              </div>
              <div className="score-bar">
                <div
                  className={`score-bar-fill ${scoreClass(entry.score)}`}
                  style={{ width: `${entry.score}%` }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{entry.rationale}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Likely Causes */}
      {result.likelyCauses.length > 0 && (
        <div className="card analysis-section">
          <h4>Likely Causes</h4>
          {result.likelyCauses.map((cause, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{cause.cause}</span>
                <span className="badge badge-purple">{cause.confidence}%</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <div><strong>Evidence:</strong> {cause.evidence}</div>
                <div><strong>Rationale:</strong> {cause.rationale}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detected Issues */}
      {result.detectedIssues.length > 0 && (
        <div className="card analysis-section">
          <h4>Detected Issues</h4>
          {result.detectedIssues.map((issue, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 8, borderLeft: `3px solid ${issue.severity === 'critical' || issue.severity === 'high' ? 'var(--danger)' : issue.severity === 'medium' ? 'var(--warning)' : 'var(--success)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{issue.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className={`badge ${issue.type === 'pest' ? 'badge-red' : issue.type === 'disease' ? 'badge-purple' : issue.type === 'deficiency' ? 'badge-yellow' : 'badge-gray'}`}>
                    {issue.type}
                  </span>
                  <span className={`badge ${issue.severity === 'critical' || issue.severity === 'high' ? 'badge-red' : issue.severity === 'medium' ? 'badge-yellow' : 'badge-green'}`}>
                    {issue.severity}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <div><strong>Evidence:</strong> {issue.evidence}</div>
                <div><strong>Treatment:</strong> {issue.treatment}</div>
                <div><strong>Confidence:</strong> {issue.confidence}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evidence & Observations */}
      {result.evidenceObservations.length > 0 && (
        <div className="card analysis-section">
          <h4>Evidence & Observations</h4>
          {result.evidenceObservations.map((obs, i) => (
            <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--info)' }}>
              {obs}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      <div className="card analysis-section">
        <h4>Recommendations</h4>
        {result.recommendations.immediate.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Immediate (within 24 hours)
            </div>
            {result.recommendations.immediate.map((rec, i) => (
              <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--danger)' }}>
                {rec}
              </div>
            ))}
          </div>
        )}
        {result.recommendations.shortTerm.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Short-term (1-7 days)
            </div>
            {result.recommendations.shortTerm.map((rec, i) => (
              <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--warning)' }}>
                {rec}
              </div>
            ))}
          </div>
        )}
        {result.recommendations.longTerm.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Long-term (ongoing)
            </div>
            {result.recommendations.longTerm.map((rec, i) => (
              <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--success)' }}>
                {rec}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Uncertainties */}
      {result.uncertainties.length > 0 && (
        <div className="card analysis-section">
          <h4>Uncertainties & Limitations</h4>
          {result.uncertainties.map((u, i) => (
            <div key={i} className="recommendation-item" style={{ borderLeftColor: 'var(--text-dim)', color: 'var(--text-muted)' }}>
              {u}
            </div>
          ))}
        </div>
      )}

      {/* Prognosis & Follow-up */}
      <div className="card layout-split-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
            Prognosis
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{result.prognosis}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
            Follow-up Schedule
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{result.followUpSchedule}</div>
        </div>
      </div>
    </div>
  );
}
