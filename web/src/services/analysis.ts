import type {
  AnalysisParams,
  PlantAnalysisResult,
  HealthScoreBreakdown,
  LikelyCause,
  RecommendationGroup,
  UrgencyLevel,
} from '../types';
import { loadTemperatureUnit } from '../utils/storage';

// ============================================
// Analysis Prompt Generator (from CannaAI v5.0)
// ============================================

export function generateAnalysisPrompt(params: AnalysisParams): string {
  const hasImage = !!params.image;

  let prompt = `🌿 **EXPERT CANNABIS/HEMP DIAGNOSTIC SYSTEM v5.0 - EXPLAINABLE AI ANALYSIS** 🌿

You are a world-class cannabis plant diagnostician. Analyze the provided information and return a SINGLE valid JSON object with NO markdown wrapping, NO code fences, NO explanatory text outside the JSON.

**SPECIFICITY CONTRACT**: Never give vague diagnoses. Be specific about what you see and why.

`;

  if (params.strain) prompt += `**Strain:** ${params.strain}\n`;
  if (params.growthStage) prompt += `**Growth Stage:** ${params.growthStage}\n`;
  if (params.medium) prompt += `**Growing Medium:** ${params.medium}\n`;
  if (params.phLevel) prompt += `**pH Level:** ${params.phLevel} (optimal: 6.0-7.0)\n`;
  if (params.temperature !== undefined) {
    const unit = loadTemperatureUnit();
    if (unit === 'F') {
      prompt += `**Temperature:** ${params.temperature}°F (optimal: 68-79°F)\n`;
      prompt += `**IMPORTANT: Use Fahrenheit (°F) for ALL temperature references in your response. Do NOT use Celsius.**\n`;
    } else {
      prompt += `**Temperature:** ${params.temperature}°C (optimal: 20-26°C)\n`;
    }
  }
  if (params.humidity) prompt += `**Humidity:** ${params.humidity}% (optimal: 40-60%)\n`;
  if (params.symptoms?.length) prompt += `**Reported Symptoms:** ${params.symptoms.join(', ')}\n`;
  if (params.leafSymptoms?.length) prompt += `**Leaf Symptoms:** ${params.leafSymptoms.join(', ')}\n`;
  if (params.notes) prompt += `**Additional Notes:** ${params.notes}\n`;

  if (hasImage) {
    prompt += `\n**IMAGE PROVIDED**: Analyze the attached plant image for visual symptoms, leaf color, texture, pest damage, disease signs, trichome maturity, and overall plant health.\n`;
  } else {
    prompt += `\n**NO IMAGE**: Analysis is text-only. Note this limitation in uncertainties.\n`;
  }

  prompt += `
**REQUIRED JSON SCHEMA** (return EXACTLY this structure):
{
  "diagnosis": "Specific primary diagnosis (e.g., 'Magnesium Deficiency in Late Vegetative Stage')",
  "summary": "2-3 sentence overview of findings",
  "urgency": "low|medium|high|critical",
  "urgencyReasons": ["reason1", "reason2 (minimum 2)"],
  "healthScore": 0-100,
  "healthScoreBreakdown": {
    "vigor": {"score": 0-100, "rationale": "explanation"},
    "leafCondition": {"score": 0-100, "rationale": "explanation"},
    "pestFree": {"score": 0-100, "rationale": "explanation"},
    "environmentOptimal": {"score": 0-100, "rationale": "explanation"},
    "growthStageAppropriate": {"score": 0-100, "rationale": "explanation"},
    "rootHealth": {"score": 0-100, "rationale": "explanation"}
  },
  "likelyCauses": [
    {"cause": "specific cause", "confidence": 0-100, "evidence": "what you observed", "rationale": "why this cause fits"}
  ],
  "evidenceObservations": ["observation1", "observation2", "observation3 (min 3)"],
  "uncertainties": ["limitation1", "limitation2 (min 2)"],
  "recommendations": {
    "immediate": ["action within 24 hours"],
    "shortTerm": ["action within 1-7 days"],
    "longTerm": ["ongoing practices"]
  },
  "detectedIssues": [
    {"type": "pest|disease|deficiency|toxicity|stress|environmental", "name": "issue name", "severity": "low|medium|high|critical", "confidence": 0-100, "evidence": "visual/text evidence", "treatment": "specific treatment"}
  ],
  "confidence": 0-100,
  "prognosis": "Expected outcome with proper treatment",
  "followUpSchedule": "When to re-check"
}

**DIAGNOSTIC REFERENCE**:
- Nutrient Deficiencies: N (bottom-up yellowing), P (purple stems/dark leaves), K (leaf tip burn), Mg (interveinal chlorosis), Fe (new growth chlorosis), Ca (brown spots), S (yellow new growth)
- Pests: spider mites (stippling/webbing), thrips (silver streaks), aphids (sticky residue/curling), fungus gnats (soil flies/root damage)
- Diseases: powdery mildew (white powder), botrytis/grey mold (buds), root rot (wilting+brown roots), damping off (seedling stem collapse)
- Trichome: clear=not ready, cloudy=peak THC, amber=degrading CBN

CRITICAL: Your ENTIRE response must be a single valid JSON object. Start with { and end with }. Do NOT include any text, markdown, code fences, or explanation before or after the JSON. Do NOT wrap in \`\`\`json blocks. Just the raw JSON object.`;

  return prompt;
}

// ============================================
// Council-Enhanced Analysis Prompt
// ============================================

export function generateCouncilAnalysisPrompt(
  params: AnalysisParams,
  councilDeliberation: string
): string {
  const basePrompt = generateAnalysisPrompt(params);

  return `${basePrompt}

**AI COUNCIL DELIBERATION**:
The following expert council members have deliberated on this case:
${councilDeliberation}

Incorporate the council's insights into your final analysis. If council members disagree, note the disagreement in uncertainties and explain which position you weight more heavily and why.`;
}

// ============================================
// JSON Extraction (from CannaAI)
// ============================================

export function extractJSONFromResponse(response: string): {
  success: boolean;
  data?: PlantAnalysisResult;
  error?: string;
  method: string;
} {
  if (!response || typeof response !== 'string') {
    return { success: false, error: 'Empty response', method: 'none' };
  }

  // Strip thinking/reasoning tags that reasoning models emit (e.g. <think>...</think>)
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Also strip <reasoning>, <analysis>, and similar wrapper tags
  cleaned = cleaned.replace(/<(?:reasoning|analysis|scratchpad|inner_monologue)>[\s\S]*?<\/(?:reasoning|analysis|scratchpad|inner_monologue)>/gi, '').trim();

  if (!cleaned) {
    // Retry: some models put the JSON *inside* the thinking block
    const thinkMatch = response.match(/<think>[\s\S]*?({[\s\S]*})[\s\S]*?<\/think>/i);
    if (thinkMatch) {
      cleaned = thinkMatch[1].trim();
    } else {
      return { success: false, error: 'Response contained only thinking, no JSON output', method: 'none' };
    }
  }

  const trimmed = cleaned;

  // Direct parse
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return { success: true, data: JSON.parse(trimmed), method: 'direct' };
    } catch { /* fall through */ }
  }

  // Markdown code block extraction
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return { success: true, data: JSON.parse(mdMatch[1].trim()), method: 'markdown' };
    } catch { /* fall through */ }
  }

  // Balanced brace extraction — collect ALL top-level JSON candidates,
  // try each one (LLMs sometimes emit multiple JSON objects)
  const candidates: string[] = [];
  let startIdx = trimmed.indexOf('{');
  while (startIdx !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    let endIdx = -1;

    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { endIdx = i + 1; break; }
      }
    }

    if (endIdx !== -1) {
      candidates.push(trimmed.substring(startIdx, endIdx));
      startIdx = trimmed.indexOf('{', endIdx);
    } else {
      break;
    }
  }

  // Try each candidate, preferring the one with the most expected keys
  const requiredKeys = ['diagnosis', 'summary', 'urgency', 'healthScore'];
  let bestResult: { data: PlantAnalysisResult; method: string } | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const keyCount = requiredKeys.filter((k) => k in parsed).length;
      if (!bestResult || keyCount > requiredKeys.filter((k) => k in bestResult!.data).length) {
        bestResult = { data: parsed, method: 'balanced-braces' };
        if (keyCount === requiredKeys.length) break; // perfect match
      }
    } catch {
      const repaired = repairJSON(candidate);
      if (repaired) {
        try {
          const parsed = JSON.parse(repaired);
          const keyCount = requiredKeys.filter((k) => k in parsed).length;
          if (!bestResult || keyCount > requiredKeys.filter((k) => k in bestResult!.data).length) {
            bestResult = { data: parsed, method: 'repaired' };
            if (keyCount === requiredKeys.length) break;
          }
        } catch { /* skip this candidate */ }
      }
    }
  }

  if (bestResult) {
    return { success: true, data: bestResult.data, method: bestResult.method };
  }

  // Last-ditch: find the first { and last } and try to parse the substring between them.
  // This handles cases where the LLM wraps JSON in prose like "Here is the analysis: { ... } Let me know..."
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return { success: true, data: JSON.parse(slice), method: 'first-last-brace' };
    } catch {
      const repaired = repairJSON(slice);
      if (repaired) {
        try {
          return { success: true, data: JSON.parse(repaired), method: 'first-last-repaired' };
        } catch { /* fall through */ }
      }
    }
  }

  // Pattern match: find the largest JSON-like substring containing required keys
  const jsonPattern = /\{[^{}]*"(?:diagnosis|summary|urgency|healthScore)"[^{}]*\}/g;
  const matches = trimmed.match(jsonPattern);
  if (matches) {
    // Sort by length descending — try the largest match first
    const sorted = [...matches].sort((a, b) => b.length - a.length);
    for (const match of sorted) {
      try {
        return { success: true, data: JSON.parse(match), method: 'pattern-match' };
      } catch {
        const repaired = repairJSON(match);
        if (repaired) {
          try {
            return { success: true, data: JSON.parse(repaired), method: 'pattern-repaired' };
          } catch { /* skip */ }
        }
      }
    }
  }

  // Try each balanced-brace candidate again with repairJSON, in case we missed one
  for (const candidate of candidates) {
    const repaired = repairJSON(candidate);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        if (requiredKeys.some((k) => k in parsed)) {
          return { success: true, data: parsed, method: 'candidate-repaired' };
        }
      } catch { /* skip */ }
    }
  }

  return {
    success: false,
    error: `Could not extract valid JSON from response (${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} found, none parsed)`,
    method: 'none',
  };
}

function repairJSON(json: string): string | null {
  let repaired = json;
  // Fix trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  // Fix missing commas between } and { or ] and [ (LLMs sometimes omit these)
  repaired = repaired.replace(/}\s*{/g, '},{');
  repaired = repaired.replace(/]\s*\[/g, '],[');
  // Fix unescaped newlines/tabs inside string values
  repaired = repaired.replace(/(?<=": *")([^"]*?)(?=")/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '')
  );
  // Fix unbalanced braces
  const opens = (repaired.match(/{/g) || []).length;
  const closes = (repaired.match(/}/g) || []).length;
  if (opens > closes) {
    repaired += '}'.repeat(opens - closes);
  }
  // Fix unbalanced brackets
  const openB = (repaired.match(/\[/g) || []).length;
  const closeB = (repaired.match(/\]/g) || []).length;
  if (openB > closeB) {
    repaired += ']'.repeat(openB - closeB);
  }
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

// ============================================
// Result Validation & Defaults
// ============================================

export function validateAndFillDefaults(data: Partial<PlantAnalysisResult>): PlantAnalysisResult {
  return {
    diagnosis: data.diagnosis || 'Analysis pending - insufficient data',
    summary: data.summary || 'No summary provided by AI.',
    urgency: validateUrgency(data.urgency),
    urgencyReasons: Array.isArray(data.urgencyReasons) && data.urgencyReasons.length >= 2
      ? data.urgencyReasons
      : ['Unable to determine specific urgency factors'],
    healthScore: clampScore(data.healthScore ?? 50),
    healthScoreBreakdown: fillBreakdown(data.healthScoreBreakdown, data.healthScore ?? 50),
    likelyCauses: fillCauses(data.likelyCauses, data.diagnosis || 'Unknown'),
    evidenceObservations: Array.isArray(data.evidenceObservations) && data.evidenceObservations.length > 0
      ? data.evidenceObservations
      : ['Analysis based on provided information'],
    uncertainties: Array.isArray(data.uncertainties) && data.uncertainties.length > 0
      ? data.uncertainties
      : ['Limited information available for comprehensive analysis'],
    recommendations: fillRecommendations(data.recommendations),
    detectedIssues: Array.isArray(data.detectedIssues) ? data.detectedIssues : [],
    confidence: clampScore(data.confidence ?? 60),
    prognosis: data.prognosis || 'Prognosis depends on following recommended actions.',
    followUpSchedule: data.followUpSchedule || 'Re-check in 3-5 days for changes.',
  };
}

function validateUrgency(u?: string): UrgencyLevel {
  const valid: UrgencyLevel[] = ['low', 'medium', 'high', 'critical'];
  return valid.includes(u as UrgencyLevel) ? (u as UrgencyLevel) : 'medium';
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fillBreakdown(
  b: Partial<HealthScoreBreakdown> | undefined,
  base: number
): HealthScoreBreakdown {
  const entry = (score?: number, label = '') => ({
    score: clampScore(score ?? base),
    rationale: `${label} assessed at ${score ?? base}/100 based on available information.`,
  });

  return {
    vigor: b?.vigor || entry(base, 'Plant vigor'),
    leafCondition: b?.leafCondition || entry(base - 5, 'Leaf condition'),
    pestFree: b?.pestFree || entry(base + 5, 'Pest-free status'),
    environmentOptimal: b?.environmentOptimal || entry(base, 'Environmental conditions'),
    growthStageAppropriate: b?.growthStageAppropriate || entry(base, 'Growth stage appropriateness'),
    rootHealth: b?.rootHealth || entry(base, 'Root health'),
  };
}

function fillCauses(c: unknown, diagnosis: string): LikelyCause[] {
  if (Array.isArray(c) && c.length > 0) {
    return c.map((item) => ({
      cause: typeof item === 'string' ? item : (item as LikelyCause).cause || 'Unknown',
      confidence: (item as LikelyCause).confidence ?? 50,
      evidence: (item as LikelyCause).evidence || 'Based on analysis',
      rationale: (item as LikelyCause).rationale || 'Consistent with observed symptoms',
    }));
  }
  return [{ cause: diagnosis, confidence: 60, evidence: 'Primary diagnosis', rationale: 'Based on overall analysis' }];
}

function fillRecommendations(r: unknown): RecommendationGroup {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const rec = r as Partial<RecommendationGroup>;
    return {
      immediate: Array.isArray(rec.immediate) ? rec.immediate : ['Consult detailed analysis for immediate actions'],
      shortTerm: Array.isArray(rec.shortTerm) ? rec.shortTerm : ['Monitor plant response over the next few days'],
      longTerm: Array.isArray(rec.longTerm) ? rec.longTerm : ['Maintain consistent growing practices'],
    };
  }
  return {
    immediate: ['Review analysis results carefully'],
    shortTerm: ['Monitor plant daily for changes'],
    longTerm: ['Keep detailed grow logs'],
  };
}
