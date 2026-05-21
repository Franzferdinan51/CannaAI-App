// ============================================
// Agent Team Orchestrator
// Inspired by Agent-Teams: Council → Team → Execute
// Coordinates multi-agent teams for complex analysis
// ============================================

import type {
  CouncilPersona,
  CouncilMessage,
  CouncilTeamTemplate,
  ProviderConfig,
  AIRequest,
  PlantAnalysisResult,
} from '../types';
import { COUNCIL_PERSONAS, TEAM_TEMPLATES } from './council';
import { executeRequest } from './ai-providers';

// ============================================
// Team Task Types
// ============================================

export interface TeamTask {
  id: string;
  label: string;
  description: string;
  assignedPersonaIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TeamResult {
  id: string;
  templateId: string;
  teamName: string;
  topic: string;
  tasks: TeamTask[];
  messages: CouncilMessage[];
  synthesis: string;
  consensus: number;
  recommendations: string[];
  timestamp: number;
}

export interface CouncilReviewResult {
  approved: boolean;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  corrections: string[];
  additionalRecommendations: string[];
  reviewerComments: Array<{
    personaName: string;
    emoji: string;
    comment: string;
    vote: 'agree' | 'disagree' | 'conditional';
  }>;
  summary: string;
}

// ============================================
// Run a Team from a Template
// ============================================

export async function runTeamFromTemplate(params: {
  templateId: string;
  topic: string;
  context?: string;
  providers: ProviderConfig[];
  image?: string;
  onMessage?: (msg: CouncilMessage) => void;
  onTaskUpdate?: (task: TeamTask) => void;
}): Promise<TeamResult> {
  const { templateId, topic, context, providers, image, onMessage, onTaskUpdate } = params;

  const template = TEAM_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown team template: ${templateId}`);

  const personas = COUNCIL_PERSONAS.filter((p) =>
    template.personaIds.includes(p.id)
  );

  const tasks: TeamTask[] = [];
  const messages: CouncilMessage[] = [];

  // Generate tasks based on template and topic
  const generatedTasks = generateTeamTasks(template, topic);
  tasks.push(...generatedTasks);

  // Execute each task with assigned persona
  for (const task of tasks) {
    task.status = 'in_progress';
    task.startedAt = Date.now();
    onTaskUpdate?.(task);

    const assignedPersonas = personas.filter((p) =>
      task.assignedPersonaIds.includes(p.id)
    );

    const taskResults: string[] = [];

    for (const persona of assignedPersonas) {
      const prompt = buildTeamTaskPrompt(persona, task, topic, context, taskResults);
      const content = await callTeamPersona(persona, prompt, providers, image);

      const msg: CouncilMessage = {
        id: `${persona.id}-team-${task.id}-${Date.now()}`,
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        content,
        timestamp: Date.now(),
        round: 'opening',
      };

      messages.push(msg);
      taskResults.push(`**${persona.name}**: ${content}`);
      onMessage?.(msg);
    }

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = taskResults.join('\n\n');
    onTaskUpdate?.(task);
  }

  // Synthesize team results
  const synthesis = await synthesizeTeamResults(
    template,
    topic,
    tasks,
    messages,
    providers
  );

  return {
    id: `team-${Date.now()}`,
    templateId,
    teamName: template.name,
    topic,
    tasks,
    messages,
    synthesis: synthesis.text,
    consensus: synthesis.consensus,
    recommendations: synthesis.recommendations,
    timestamp: Date.now(),
  };
}

// ============================================
// Council Review — QA a diagnosis
// ============================================

export async function councilReviewDiagnosis(params: {
  diagnosis: PlantAnalysisResult;
  observations: string[];
  providers: ProviderConfig[];
  image?: string;
  onMessage?: (msg: CouncilMessage) => void;
}): Promise<CouncilReviewResult> {
  const { diagnosis, observations, providers, image, onMessage } = params;

  // Select review panel — 3-4 councilors most relevant to the diagnosis
  const reviewPersonas = selectReviewPanel(diagnosis);
  const reviewerComments: CouncilReviewResult['reviewerComments'] = [];
  const allComments: string[] = [];

  // Each reviewer independently evaluates the diagnosis
  for (const persona of reviewPersonas) {
    const prompt = buildReviewPrompt(persona, diagnosis, observations, allComments);
    const content = await callTeamPersona(persona, prompt, providers, image);

    const msg: CouncilMessage = {
      id: `${persona.id}-review-${Date.now()}`,
      personaId: persona.id,
      personaName: persona.name,
      personaEmoji: persona.emoji,
      content,
      timestamp: Date.now(),
      round: 'opening',
    };

    onMessage?.(msg);

    // Extract vote and comments
    const vote = extractReviewVote(content);
    reviewerComments.push({
      personaName: persona.name,
      emoji: persona.emoji,
      comment: content,
      vote,
    });

    allComments.push(`**${persona.name}** (${vote}): ${content}`);
  }

  // Synthesize review
  const agreeCount = reviewerComments.filter((r) => r.vote === 'agree').length;
  const conditionalCount = reviewerComments.filter((r) => r.vote === 'conditional').length;
  const disagreeCount = reviewerComments.filter((r) => r.vote === 'disagree').length;
  const total = reviewerComments.length;

  const approvalRate = (agreeCount + conditionalCount * 0.5) / total;
  const approved = approvalRate >= 0.5;

  // Extract strengths, weaknesses, corrections from comments
  const strengths = extractStrengths(allComments);
  const weaknesses = extractWeaknesses(allComments);
  const corrections = extractCorrections(allComments);
  const additionalRecommendations = extractAdditionalRecs(allComments);

  const summary = approved
    ? `Council Review: APPROVED (${Math.round(approvalRate * 100)}% agreement). ${conditionalCount > 0 ? `${conditionalCount} conditional approvals with suggestions.` : ''}`
    : `Council Review: NEEDS REVISION (${Math.round(approvalRate * 100)}% agreement). ${disagreeCount} reviewers found issues.`;

  return {
    approved,
    confidence: Math.round(approvalRate * 100),
    strengths,
    weaknesses,
    corrections,
    additionalRecommendations,
    reviewerComments,
    summary,
  };
}

// ============================================
// Quick Team Consultation (single prompt)
// ============================================

export async function quickTeamConsult(params: {
  templateId: string;
  question: string;
  providers: ProviderConfig[];
  image?: string;
}): Promise<string> {
  const { templateId, question, providers, image } = params;

  const template = TEAM_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown team template: ${templateId}`);

  const personas = COUNCIL_PERSONAS.filter((p) =>
    template.personaIds.includes(p.id)
  );

  const teamContext = personas.map(
    (p) => `${p.emoji} **${p.name}** (${p.role}): ${p.expertise.join(', ')}`
  ).join('\n');

  const prompt = `You are the ${template.emoji} **${template.name}** — a specialized team of experts.

**Team Members:**
${teamContext}

**Question:** ${question}

Respond as a unified team, referencing each member's expertise where relevant. Be thorough and actionable.`;

  const request: AIRequest = {
    prompt,
    image,
    systemPrompt: `You are the ${template.name}, a collaborative AI team. Combine the expertise of all team members into a cohesive, actionable response.`,
    useVision: !!image,
    temperature: 0.7,
  };

  const active = providers.filter((p) => (image ? p.visionModel : p.textModel));
  for (const provider of active) {
    const result = await executeRequest(provider, request);
    if (result.success) return result.content;
  }

  return 'Unable to consult the team — no provider available.';
}

// ============================================
// Internal Helpers
// ============================================

function generateTeamTasks(template: CouncilTeamTemplate, topic: string): TeamTask[] {
  const tasks: TeamTask[] = [];

  // Generate tasks based on template type
  switch (template.id) {
    case 'diagnosis':
      tasks.push({
        id: 'task-symptoms',
        label: 'Symptom Analysis',
        description: `Analyze observed symptoms in: ${topic}`,
        assignedPersonaIds: ['nutrient-manager', 'ipm-specialist'],
        status: 'pending',
      });
      tasks.push({
        id: 'task-environment',
        label: 'Environmental Assessment',
        description: `Evaluate environmental factors for: ${topic}`,
        assignedPersonaIds: ['environment-controller', 'cultivator'],
        status: 'pending',
      });
      break;

    case 'harvest':
      tasks.push({
        id: 'task-trichome',
        label: 'Trichome Assessment',
        description: `Evaluate harvest readiness: ${topic}`,
        assignedPersonaIds: ['trichome-inspector'],
        status: 'pending',
      });
      tasks.push({
        id: 'task-curing',
        label: 'Post-Harvest Planning',
        description: `Plan post-harvest handling: ${topic}`,
        assignedPersonaIds: ['cure-master', 'compliance-officer'],
        status: 'pending',
      });
      break;

    case 'grow-optimization':
      tasks.push({
        id: 'task-yield',
        label: 'Yield Optimization',
        description: `Identify yield improvement opportunities: ${topic}`,
        assignedPersonaIds: ['cultivator', 'strain-breeder'],
        status: 'pending',
      });
      tasks.push({
        id: 'task-environment-opt',
        label: 'Environmental Tuning',
        description: `Optimize growing environment: ${topic}`,
        assignedPersonaIds: ['environment-controller', 'nutrient-manager'],
        status: 'pending',
      });
      break;

    case 'emergency':
      tasks.push({
        id: 'task-triage',
        label: 'Emergency Triage',
        description: `Assess critical situation: ${topic}`,
        assignedPersonaIds: ['ipm-specialist', 'nutrient-manager', 'environment-controller'],
        status: 'pending',
      });
      break;

    default:
      // Generic task for unknown templates
      tasks.push({
        id: 'task-analysis',
        label: 'Team Analysis',
        description: `Analyze: ${topic}`,
        assignedPersonaIds: template.personaIds,
        status: 'pending',
      });
  }

  return tasks;
}

function buildTeamTaskPrompt(
  persona: CouncilPersona,
  task: TeamTask,
  topic: string,
  context?: string,
  priorResults?: string[]
): string {
  let prompt = `**TEAM TASK: ${task.label}**
${task.description}

**Topic:** ${topic}
`;

  if (context) {
    prompt += `\n**Context:** ${context}\n`;
  }

  if (priorResults && priorResults.length > 0) {
    prompt += `\n**Team Members' Findings So Far:**
${priorResults.join('\n\n---\n\n')}

Build on these findings with your expertise. Do not repeat what's been said — add new insights.
`;
  }

  prompt += `\nAs ${persona.name} (${persona.role}), provide your expert analysis for this task. Be specific, actionable, and focused on your area of expertise. Keep your response under 400 words.`;

  return prompt;
}

function buildReviewPrompt(
  persona: CouncilPersona,
  diagnosis: PlantAnalysisResult,
  observations: string[],
  priorReviews?: string[]
): string {
  let prompt = `**COUNCIL REVIEW — DIAGNOSIS QUALITY ASSURANCE**

You are reviewing a plant diagnosis for accuracy and completeness.

**Diagnosis Under Review:**
- Diagnosis: ${diagnosis.diagnosis}
- Health Score: ${diagnosis.healthScore}/100
- Urgency: ${diagnosis.urgency}
- Summary: ${diagnosis.summary}
- Confidence: ${diagnosis.confidence}%
- Likely Causes: ${diagnosis.likelyCauses.map((c) => `${c.cause} (${c.confidence}%)`).join(', ')}
- Detected Issues: ${diagnosis.detectedIssues.map((i) => `${i.name} (${i.severity})`).join(', ')}
- Key Recommendations: ${diagnosis.recommendations.immediate.slice(0, 3).join('; ')}
- Prognosis: ${diagnosis.prognosis}

**Observations Used:**
${observations.join('\n')}
`;

  if (priorReviews && priorReviews.length > 0) {
    prompt += `\n**Other Reviewers' Comments:**
${priorReviews.join('\n\n')}

Consider their perspectives but form your own independent assessment.
`;
  }

  prompt += `
As ${persona.name} (${persona.role}), evaluate this diagnosis:
1. Is the diagnosis accurate given the evidence?
2. Are there any missing considerations from your area of expertise?
3. Are the recommendations appropriate and complete?
4. What would you add or change?

End your review with:
VOTE: [AGREE/DISAGREE/CONDITIONAL]
(AGREE = diagnosis is sound, DISAGREE = significant issues, CONDITIONAL = mostly correct but needs additions)

Be specific about what's good and what could be better. Keep under 300 words.`;

  return prompt;
}

async function callTeamPersona(
  persona: CouncilPersona,
  prompt: string,
  providers: ProviderConfig[],
  image?: string
): Promise<string> {
  const request: AIRequest = {
    prompt,
    image,
    systemPrompt: persona.systemPrompt,
    useVision: !!image,
    temperature: 0.7,
    maxTokens: 1024,
  };

  const active = providers.filter((p) => (image ? p.visionModel : p.textModel));

  if (active.length === 0) {
    return `[Unable to reach ${persona.name} — no provider configured with a ${image ? 'vision' : 'text'} model]`;
  }

  const maxRetries = 2;
  const errors: string[] = [];

  for (const provider of active) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await executeRequest(provider, request);
      if (result.success) return result.content;
      errors.push(`${provider.name}: ${result.error || 'Unknown error'}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return `[Unable to reach ${persona.name} — all providers failed: ${errors.join('; ')}]`;
}

async function synthesizeTeamResults(
  template: CouncilTeamTemplate,
  topic: string,
  tasks: TeamTask[],
  messages: CouncilMessage[],
  providers: ProviderConfig[]
): Promise<{ text: string; consensus: number; recommendations: string[] }> {
  const taskSummaries = tasks.map((t) =>
    `**${t.label}** (${t.status}):\n${t.result || 'No results'}`
  ).join('\n\n---\n\n');

  const prompt = `You are synthesizing the results of the ${template.emoji} **${template.name}** team analysis on: "${topic}"

**Task Results:**
${taskSummaries}

Provide:
1. A unified synthesis (2-3 paragraphs) combining all team findings
2. A consensus score (0-100) based on how aligned the team members were
3. Top 3-5 actionable recommendations

Return JSON:
{
  "synthesis": "...",
  "consensus": 0-100,
  "recommendations": ["rec1", "rec2", ...]
}

Return ONLY the JSON.`;

  const request: AIRequest = {
    prompt,
    systemPrompt: 'You are a team coordinator synthesizing expert analysis into actionable recommendations.',
    temperature: 0.4,
    maxTokens: 1024,
  };

  const active = providers.filter((p) => p.textModel);
  const maxRetries = 2;

  for (const provider of active) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await executeRequest(provider, request);
      if (result.success) {
        try {
          const trimmed = result.content.trim();
          const jsonStr = trimmed.startsWith('{') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0] || '';
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            return {
              text: parsed.synthesis || result.content,
              consensus: parsed.consensus || 70,
              recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
            };
          }
        } catch { /* fall through */ }
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return {
    text: messages.map((m) => `${m.personaName}: ${m.content}`).join('\n\n'),
    consensus: 50,
    recommendations: [],
  };
}

function selectReviewPanel(diagnosis: PlantAnalysisResult): CouncilPersona[] {
  const panel: CouncilPersona[] = [];
  const urgency = diagnosis.urgency;
  const issues = diagnosis.detectedIssues;
  const hasPestIssues = issues.some((i) => i.type === 'pest');
  const hasDiseaseIssues = issues.some((i) => i.type === 'disease');
  const hasNutrientIssues = issues.some((i) => i.type === 'deficiency' || i.type === 'toxicity');
  const hasEnvIssues = issues.some((i) => i.type === 'environmental');

  // Always include cultivator as general reviewer
  panel.push(COUNCIL_PERSONAS.find((p) => p.id === 'cultivator')!);

  // Add specialists based on detected issues
  if (hasNutrientIssues) {
    panel.push(COUNCIL_PERSONAS.find((p) => p.id === 'nutrient-manager')!);
  }
  if (hasPestIssues || hasDiseaseIssues) {
    panel.push(COUNCIL_PERSONAS.find((p) => p.id === 'ipm-specialist')!);
  }
  if (hasEnvIssues || urgency === 'critical' || urgency === 'high') {
    panel.push(COUNCIL_PERSONAS.find((p) => p.id === 'environment-controller')!);
  }

  // Ensure at least 3 reviewers
  if (panel.length < 3) {
    const remaining = COUNCIL_PERSONAS.filter((p) => !panel.some((ep) => ep.id === p.id));
    while (panel.length < 3 && remaining.length > 0) {
      panel.push(remaining.shift()!);
    }
  }

  return panel.slice(0, 4); // Max 4 reviewers
}

function extractReviewVote(content: string): 'agree' | 'disagree' | 'conditional' {
  const match = content.match(/VOTE:\s*(AGREE|DISAGREE|CONDITIONAL)/i);
  if (!match) return 'conditional';
  const v = match[1].toUpperCase();
  if (v === 'AGREE') return 'agree';
  if (v === 'DISAGREE') return 'disagree';
  return 'conditional';
}

function extractStrengths(comments: string[]): string[] {
  const strengths: string[] = [];
  const patterns = [
    /strength[s]?:?\s*([^\n]+)/gi,
    /(?:good|correct|accurate|solid|well)[\s:]+([^\n]+)/gi,
    /(?:agree with|support)[\s:]+([^\n]+)/gi,
  ];
  for (const comment of comments) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(comment)) !== null) {
        const s = match[1].trim();
        if (s.length > 10 && s.length < 200) strengths.push(s);
      }
    }
  }
  return [...new Set(strengths)].slice(0, 5);
}

function extractWeaknesses(comments: string[]): string[] {
  const weaknesses: string[] = [];
  const patterns = [
    /weakness(?:es)?:?\s*([^\n]+)/gi,
    /(?:concern|issue|problem|missing|lack)[s]?:?\s*([^\n]+)/gi,
    /(?:disagree|incorrect|wrong)[\s:]+([^\n]+)/gi,
  ];
  for (const comment of comments) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(comment)) !== null) {
        const s = match[1].trim();
        if (s.length > 10 && s.length < 200) weaknesses.push(s);
      }
    }
  }
  return [...new Set(weaknesses)].slice(0, 5);
}

function extractCorrections(comments: string[]): string[] {
  const corrections: string[] = [];
  const patterns = [
    /(?:should|recommend|suggest|consider|change to|correct to)[\s:]+([^\n]+)/gi,
    /(?:instead|rather|better)[\s:]+([^\n]+)/gi,
  ];
  for (const comment of comments) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(comment)) !== null) {
        const s = match[1].trim();
        if (s.length > 10 && s.length < 200) corrections.push(s);
      }
    }
  }
  return [...new Set(corrections)].slice(0, 5);
}

function extractAdditionalRecs(comments: string[]): string[] {
  const recs: string[] = [];
  const patterns = [
    /(?:additionally|also|furthermore|recommend adding)[\s:]+([^\n]+)/gi,
    /(?:don't forget|remember|important to)[\s:]+([^\n]+)/gi,
  ];
  for (const comment of comments) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(comment)) !== null) {
        const s = match[1].trim();
        if (s.length > 10 && s.length < 200) recs.push(s);
      }
    }
  }
  return [...new Set(recs)].slice(0, 5);
}
