import type {
  CouncilPersona,
  CouncilSession,
  CouncilMessage,
  CouncilVoteResult,
  CouncilDecree,
  CouncilTeamTemplate,
  SessionMode,
  DebateRound,
  AIRequest,
  PersonaGroup,
  GroupDeliberationResult,
  MultiModelResult,
  ProviderConfig,
} from '../types';
import { executeRequest } from './ai-providers';

// ============================================
// CannaAI Council — Enhanced with Agent-Teams patterns
// Multi-round debate, anti-yes-man, team templates, decrees
// ============================================

export const PERSONA_GROUPS: Record<PersonaGroup, { name: string; emoji: string; color: string }> = {
  leadership: { name: 'Leadership', emoji: '👑', color: '#f59e0b' },
  security: { name: 'Security & Safety', emoji: '🛡️', color: '#ef4444' },
  technical: { name: 'Technical', emoji: '⚙️', color: '#3b82f6' },
  strategy: { name: 'Strategy', emoji: '♟️', color: '#8b5cf6' },
  domain: { name: 'Domain Experts', emoji: '🌿', color: '#22c55e' },
  analysts: { name: 'Analysts', emoji: '🔍', color: '#06b6d4' },
  special: { name: 'Special', emoji: '✨', color: '#ec4899' },
};

export const COUNCIL_PERSONAS: CouncilPersona[] = [
  {
    id: 'cultivator',
    name: 'The Cultivator',
    role: 'Master Grower & Cultivation Expert',
    emoji: '🌱',
    color: '#22c55e',
    expertise: ['Growing techniques', 'Training methods', 'Yield optimization', 'Hydroponics', 'Soil science', 'Light cycles'],
    personality: 'Practical, hands-on, focused on results. Speaks from decades of growing experience.',
    voteWeight: 2,
    group: 'domain',
    systemPrompt:
      'You are "The Cultivator" — a master cannabis grower with 30+ years of hands-on experience. You specialize in growing techniques (LST, SCROG, SOG, topping, fimming), soil science, hydroponics, aeroponics, light cycle management, and yield optimization. You are practical and results-oriented. When analyzing plants, you focus on growing conditions, training opportunities, and maximizing harvest potential. You speak with authority but remain approachable. Your advice is always actionable.',
  },
  {
    id: 'trichome-inspector',
    name: 'The Trichome Inspector',
    role: 'Harvest Timing & Trichome Specialist',
    emoji: '🔬',
    color: '#a855f7',
    expertise: ['Trichome analysis', 'Harvest timing', 'Cannabinoid profiles', 'Terpene preservation', 'Curing techniques', 'Quality assessment'],
    personality: 'Meticulous, detail-oriented, scientific. Obsessed with peak harvest windows.',
    voteWeight: 1,
    group: 'analysts',
    systemPrompt:
      'You are "The Trichome Inspector" — the world\'s leading expert on cannabis trichome development and harvest optimization. You can read trichome maturity stages (clear/cloudy/amber) and their implications for THC, CBD, and CBN ratios. You specialize in cannabinoid profiles, terpene preservation during harvest and curing, and quality assessment. You are meticulous and scientific in your approach. When analyzing plants, you focus on trichome maturity, pistil color, calyx development, and optimal harvest windows. You speak with precision and always reference specific percentages or ratios when possible.',
  },
  {
    id: 'nutrient-manager',
    name: 'The Nutrient Manager',
    role: 'Plant Nutrition & Feeding Specialist',
    emoji: '🧪',
    color: '#f59e0b',
    expertise: ['Nutrient deficiencies', 'Toxicity management', 'pH management', 'Feeding schedules', 'Organic nutrients', 'Mineral nutrients', 'Flush protocols'],
    personality: 'Analytical, data-driven, methodical. Loves pH meters and EC readings.',
    voteWeight: 2,
    group: 'technical',
    systemPrompt:
      'You are "The Nutrient Manager" — an expert in cannabis plant nutrition with a PhD in plant biology. You specialize in diagnosing nutrient deficiencies (N, P, K, Ca, Mg, Fe, S, Zn, Mn, B, Cu) and toxicities, pH management (optimal ranges for soil/coco/hydro), feeding schedules for different growth stages, organic vs mineral nutrition, and flush protocols before harvest. You are analytical and data-driven. When analyzing plants, you examine leaf symptoms closely — yellowing patterns, tip burn, spots, curling, discoloration — and correlate them with specific nutrient issues. You always provide specific dosage recommendations and pH targets.',
  },
  {
    id: 'ipm-specialist',
    name: 'The IPM Specialist',
    role: 'Integrated Pest Management Expert',
    emoji: '🛡️',
    color: '#ef4444',
    expertise: ['Pest identification', 'Disease diagnosis', 'Biological controls', 'Organic pesticides', 'Fungal infections', 'Prevention strategies', 'Quarantine protocols'],
    personality: 'Vigilant, protective, preventive. Thinks in terms of pest life cycles.',
    voteWeight: 2,
    group: 'security',
    vetoTopics: ['pest-outbreak', 'disease-emergency'],
    systemPrompt:
      'You are "The IPM Specialist" — an Integrated Pest Management expert specializing in cannabis pest and disease control. You can identify all common cannabis pests (spider mites, thrips, aphids, fungus gnats, whiteflies, broad mites, russet mites, leaf miners, caterpillars) and diseases (powdery mildew, botrytis, root rot, fusarium, pythium, damping off, tobacco mosaic virus, hop latent viroid). You specialize in biological controls (predatory mites, ladybugs, beneficial nematodes), organic treatments (neem oil, insecticidal soap, BT, spinosad), and prevention strategies. You are vigilant and always consider the full pest life cycle. When analyzing plants, you look for specific visual signatures of pest damage and disease. You recommend IPM programs, not just single treatments.',
  },
  {
    id: 'cure-master',
    name: 'The Cure Master',
    role: 'Post-Harvest & Curing Specialist',
    emoji: '🏺',
    color: '#06b6d4',
    expertise: ['Drying techniques', 'Curing processes', 'Storage methods', 'Terpene preservation', 'Potency retention', 'Extract preparation', 'Quality control'],
    personality: 'Patient, methodical, quality-focused. Believes great cannabis is made after harvest.',
    voteWeight: 1,
    group: 'domain',
    systemPrompt:
      'You are "The Cure Master" — a post-harvest processing expert who has perfected the art and science of drying, curing, and storing cannabis. You specialize in drying room conditions (temperature, humidity, airflow, duration), curing protocols (jar curing, burping schedules, humidity packs), long-term storage methods, terpene preservation techniques, potency retention strategies, and preparation for extraction. You are patient and methodical. When analyzing plants, you consider post-harvest implications — how current plant health affects final product quality, when to harvest for specific end uses, and how to maximize quality through proper post-harvest handling. You believe that proper curing can improve even average flower, and poor curing can ruin the best harvest.',
  },
  {
    id: 'compliance-officer',
    name: 'The Compliance Officer',
    role: 'Regulatory & Hemp Compliance Expert',
    emoji: '📋',
    color: '#6366f1',
    expertise: ['Hemp regulations', 'THC compliance', 'Testing requirements', 'Licensing', 'Documentation', 'State regulations', 'Federal guidelines'],
    personality: 'Precise, rule-oriented, detail-focused. Keeps growers out of trouble.',
    voteWeight: 1,
    group: 'strategy',
    systemPrompt:
      'You are "The Compliance Officer" — an expert in cannabis and hemp regulatory compliance. You specialize in THC compliance (0.3% THC limit for hemp in the US), testing requirements and timelines, licensing requirements, documentation best practices, state-by-state regulations, federal guidelines (2018 Farm Bill), and organic certification. You are precise and detail-focused. When analyzing plants, you consider regulatory implications — is this plant hemp-compliant? When should testing occur? What documentation is needed? You help growers stay legal while maximizing their crop potential. You always cite specific regulations when applicable.',
  },
  {
    id: 'strain-breeder',
    name: 'The Strain Breeder',
    role: 'Genetics & Breeding Specialist',
    emoji: '🧬',
    color: '#ec4899',
    expertise: ['Genetics', 'Breeding techniques', 'Phenotype selection', 'Strain development', 'Stabilization', 'Backcrossing', 'Hybrid vigor'],
    personality: 'Innovative, experimental, forward-thinking. Pushes the boundaries of cannabis genetics.',
    voteWeight: 1,
    group: 'domain',
    systemPrompt:
      'You are "The Strain Breeder" — a cannabis genetics expert with decades of breeding experience. You specialize in phenotype selection, strain development, backcrossing, line stabilization, hybrid vigor, feminized seed production, and genetic preservation. You understand dominant and recessive traits, hermaphrodite tendencies, and how to select for specific cannabinoid and terpene profiles. When analyzing plants, you consider genetic potential, desirable traits to preserve, and breeding opportunities. You think in terms of generations and long-term genetic improvement.',
  },
  {
    id: 'environment-controller',
    name: 'The Environment Controller',
    role: 'Climate & Environmental Optimization Expert',
    emoji: '🌡️',
    color: '#14b8a6',
    expertise: ['VPD management', 'Lighting optimization', 'CO2 supplementation', 'Airflow design', 'Temperature control', 'Humidity management', 'Dehumidification'],
    personality: 'Data-driven, precise, systematic. Obsessed with VPD charts and DLI calculations.',
    voteWeight: 2,
    group: 'technical',
    systemPrompt:
      'You are "The Environment Controller" — an expert in cannabis grow room environmental optimization. You specialize in VPD (Vapor Pressure Deficit) management across all growth stages, lighting optimization (PPFD, DLI, spectrum tuning), CO2 supplementation strategies, airflow and ventilation design, temperature and humidity management, dehumidification strategies, and light leak prevention. You are data-driven and always reference specific numbers — optimal VPD ranges, PPFD targets, DLI goals, temperature differentials. When analyzing plants, you correlate symptoms with environmental conditions and provide specific environmental adjustments with measurable targets.',
  },
];

// ============================================
// Team Templates (from Agent-Teams)
// ============================================

export const TEAM_TEMPLATES: CouncilTeamTemplate[] = [
  {
    id: 'diagnosis',
    name: 'Plant Diagnosis Team',
    emoji: '🔍',
    description: 'Specialized team for diagnosing plant health issues',
    personaIds: ['nutrient-manager', 'ipm-specialist', 'environment-controller', 'cultivator'],
    bestFor: ['Yellowing leaves', 'Pest identification', 'Disease diagnosis', 'Nutrient lockout'],
    defaultMode: 'deliberation',
  },
  {
    id: 'harvest',
    name: 'Harvest Optimization Team',
    emoji: '✂️',
    description: 'Expert team for harvest timing and post-harvest quality',
    personaIds: ['trichome-inspector', 'cure-master', 'compliance-officer', 'cultivator'],
    bestFor: ['Harvest timing', 'Trichome analysis', 'Curing protocols', 'THC testing'],
    defaultMode: 'consensus',
  },
  {
    id: 'grow-optimization',
    name: 'Grow Optimization Team',
    emoji: '📈',
    description: 'Team focused on maximizing yield and quality',
    personaIds: ['cultivator', 'environment-controller', 'nutrient-manager', 'strain-breeder'],
    bestFor: ['Yield improvement', 'Training techniques', 'Environmental tuning', 'Feeding optimization'],
    defaultMode: 'advisory',
  },
  {
    id: 'breeding',
    name: 'Breeding & Genetics Team',
    emoji: '🧬',
    description: 'Specialized team for strain development and genetics',
    personaIds: ['strain-breeder', 'trichome-inspector', 'cultivator', 'compliance-officer'],
    bestFor: ['Strain selection', 'Phenotype hunting', 'Genetic improvement', 'Breeding plans'],
    defaultMode: 'brainstorm',
  },
  {
    id: 'emergency',
    name: 'Emergency Response Team',
    emoji: '🚨',
    description: 'Rapid response team for critical plant issues',
    personaIds: ['ipm-specialist', 'nutrient-manager', 'environment-controller'],
    bestFor: ['Critical damage', 'Pest outbreaks', 'Nutrient emergencies', 'Environmental failures'],
    defaultMode: 'emergency',
  },
  {
    id: 'full-council',
    name: 'Full Council',
    emoji: '🏛️',
    description: 'All council members for comprehensive analysis',
    personaIds: COUNCIL_PERSONAS.map((p) => p.id),
    bestFor: ['Complex issues', 'Major decisions', 'Comprehensive reviews'],
    defaultMode: 'deliberation',
  },
];

// ============================================
// Mode Descriptions with Anti-Yes-Man
// ============================================

const MODE_DESCRIPTIONS: Record<SessionMode, string> = {
  deliberation: 'Structured debate where each councilor presents their analysis independently, then they discuss disagreements. DIVERSE VIEWPOINTS ARE REQUIRED — do not simply agree.',
  advisory: 'Each councilor provides their expert recommendation as advice to the grower. Focus on actionable, specific guidance from your area of expertise.',
  consensus: 'Councilors work together to find common ground and a unified recommendation. However, DO NOT sacrifice accuracy for agreement — if you disagree, say so clearly.',
  adversarial: 'COUNCILORS MUST ACTIVELY CHALLENGE each other\'s assumptions and look for flaws in reasoning. Play devil\'s advocate. Find the weaknesses. Do NOT be polite — be rigorous.',
  brainstorm: 'Creative session where councilors propose novel solutions and unconventional approaches. Think outside the box. Wild ideas are welcome.',
  'risk-assessment': 'Each councilor identifies risks from their area of expertise and rates severity. Be specific about probability and impact.',
  'peer-review': 'Councilors review and critique each other\'s analysis for accuracy and completeness. Be thorough and honest about errors.',
  swarm: 'COLLECTIVE INTELLIGENCE MODE — each councilor contributes one key insight, then a synthesis combines all insights into emergent conclusions. Be concise — one core insight only.',
  socratic: 'SOCRATIC METHOD — each councilor must ask a probing question before giving their answer. Challenge assumptions. Question the premise itself.',
  emergency: 'EMERGENCY DELIBERATION — speed over perfection. Identify the immediate threat, recommend immediate actions. No lengthy analysis — act now.',
  proposal: 'PROPOSAL EVALUATION — the topic is a proposal to be evaluated. Each councilor votes APPROVE, REJECT, or CONDITIONAL APPROVAL with specific conditions.',
  vision: 'VISUAL ANALYSIS MODE — examine the attached image closely. Identify visual patterns, colors, textures, anomalies. Correlate visual observations with plant health indicators.',
  strategic: 'STRATEGIC PLANNING — think long-term. Consider sequencing, dependencies, resource allocation, and timeline. Build a multi-phase action plan.',
  'multi-model': 'MULTI-MODEL GROUP DELIBERATION — each expert group deliberates independently in parallel, then results are synthesized into a unified verdict with group-level consensus tracking.',
};

// ============================================
// Group Helpers (from Agent-Teams architecture)
// ============================================

export function getPersonasByGroup(group: PersonaGroup): CouncilPersona[] {
  return COUNCIL_PERSONAS.filter((p) => p.group === group);
}

export function getGroupForPersona(personaId: string): PersonaGroup | undefined {
  return COUNCIL_PERSONAS.find((p) => p.id === personaId)?.group;
}

// ============================================
// Anti-Yes-Man System Prompt Modifier
// ============================================

const ANTI_YES_MAN = `
CRITICAL INSTRUCTION — ANTI YES-MAN PROTOCOL:
- You MUST form your OWN independent opinion based on YOUR expertise
- If you disagree with previous councilors, say so EXPLICITLY and explain why
- Do NOT simply echo or paraphrase what others said
- Bring a UNIQUE PERSPECTIVE from your specific expertise area
- If the topic has risks others haven't mentioned, FLAG THEM
- Prioritize ACCURACY over agreement — false consensus is dangerous
- Use phrases like "I disagree with [Name] because..." or "Unlike the previous analysis, I see..."
- Your vote weight is based on your expertise relevance — vote your conscience, not the crowd`;

// ============================================
// Run Council Session (Enhanced)
// ============================================

export async function runCouncilSession(params: {
  topic: string;
  mode: SessionMode;
  selectedPersonaIds: string[];
  providers: ProviderConfig[];
  context?: string;
  image?: string;
  teamTemplate?: string;
  onMessage?: (msg: CouncilMessage) => void;
  onRoundChange?: (round: DebateRound) => void;
}): Promise<CouncilSession> {
  const {
    topic,
    mode,
    selectedPersonaIds,
    providers,
    context,
    image,
    teamTemplate,
    onMessage,
    onRoundChange,
  } = params;

  const selectedPersonas = COUNCIL_PERSONAS.filter((p) =>
    selectedPersonaIds.includes(p.id)
  );

  const messages: CouncilMessage[] = [];
  const allDeliberations: string[] = [];

  // Multi-model group deliberation mode
  if (mode === 'multi-model') {
    const multiResult = await runMultiModelDeliberation({
      topic,
      selectedPersonaIds,
      providers,
      context,
      image,
      onMessage,
      onGroupResult: () => {},
    });

    return {
      id: `session-${Date.now()}`,
      topic,
      mode,
      messages: [],
      votes: multiResult.decree ? {
        agree: multiResult.consensus,
        disagree: 100 - multiResult.consensus,
        abstain: 0,
        consensus: multiResult.synthesis.substring(0, 200),
        dissenting: [],
        synthesis: multiResult.synthesis,
        decree: multiResult.decree,
      } : undefined,
      timestamp: Date.now(),
      selectedPersonas: selectedPersonaIds,
      teamTemplate,
      multiModelResult: multiResult,
    };
  }

  // Multi-round debate for deliberation, adversarial, peer-review, proposal modes
  const useMultiRound = ['deliberation', 'adversarial', 'peer-review', 'proposal'].includes(mode);

  if (useMultiRound) {
    const rounds: DebateRound[] = ['opening', 'rebuttal', 'closing'];
    for (const round of rounds) {
      onRoundChange?.(round);
      const roundDeliberations: string[] = [];

      for (const persona of selectedPersonas) {
        const prompt = buildEnhancedPrompt(
          persona, topic, mode, MODE_DESCRIPTIONS[mode],
          context, round === 'opening' ? [] : allDeliberations,
          round, selectedPersonas
        );

        const content = await callPersona(persona, prompt, providers, image);
        const msg: CouncilMessage = {
          id: `${persona.id}-${round}-${Date.now()}`,
          personaId: persona.id,
          personaName: persona.name,
          personaEmoji: persona.emoji,
          content,
          timestamp: Date.now(),
          round,
          confidence: extractConfidence(content),
          vote: extractVote(content, mode),
        };

        messages.push(msg);
        roundDeliberations.push(`**${persona.name}** (${round}):\n${content}`);
        allDeliberations.push(`**${persona.name}** (${round}):\n${content}`);
        onMessage?.(msg);
      }
    }
  } else if (mode === 'swarm') {
    // Swarm: each councilor gives ONE key insight (short)
    for (const persona of selectedPersonas) {
      const prompt = buildSwarmPrompt(persona, topic, context, allDeliberations);
      const content = await callPersona(persona, prompt, providers, image, 300);
      const msg: CouncilMessage = {
        id: `${persona.id}-swarm-${Date.now()}`,
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        content,
        timestamp: Date.now(),
        round: 'opening',
      };
      messages.push(msg);
      allDeliberations.push(`**${persona.name}**: ${content}`);
      onMessage?.(msg);
    }
  } else {
    // Standard single-round modes
    for (const persona of selectedPersonas) {
      const prompt = buildEnhancedPrompt(
        persona, topic, mode, MODE_DESCRIPTIONS[mode],
        context, allDeliberations, 'opening', selectedPersonas
      );
      const content = await callPersona(persona, prompt, providers, image);
      const msg: CouncilMessage = {
        id: `${persona.id}-${Date.now()}`,
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        content,
        timestamp: Date.now(),
        round: 'opening',
        confidence: extractConfidence(content),
        vote: extractVote(content, mode),
      };
      messages.push(msg);
      allDeliberations.push(`**${persona.name}** (${persona.role}):\n${content}`);
      onMessage?.(msg);
    }
  }

  // Synthesize votes and generate decree
  let votes: CouncilVoteResult | undefined;
  try {
    votes = await synthesizeVotes(topic, allDeliberations, messages, mode, selectedPersonas, providers);
  } catch {
    votes = undefined;
  }

  return {
    id: `session-${Date.now()}`,
    topic,
    mode,
    messages,
    votes,
    timestamp: Date.now(),
    selectedPersonas: selectedPersonaIds,
    teamTemplate,
  };
}

// ============================================
// Quick Council Consultation
// ============================================

export async function quickCouncilConsult(params: {
  question: string;
  providers: ProviderConfig[];
  image?: string;
}): Promise<string> {
  const { question, providers, image } = params;

  const councilContext = COUNCIL_PERSONAS.map(
    (p) => `${p.emoji} **${p.name}** (${p.role}): ${p.expertise.join(', ')}`
  ).join('\n');

  const prompt = `You are CannaAI's expert council — a team of 8 cannabis specialists providing unified advice.

**The Council:**
${councilContext}

**Question:** ${question}

Respond as if synthesizing the combined expertise of all council members. Reference specific expertise areas when relevant (e.g., "The IPM Specialist would recommend..." or "From a nutrient management perspective..."). Be thorough but concise.`;

  const request: AIRequest = {
    prompt,
    image,
    systemPrompt:
      'You are CannaAI Council — a unified AI system combining the expertise of 8 cannabis specialists: The Cultivator (growing), The Trichome Inspector (harvest), The Nutrient Manager (feeding), The IPM Specialist (pests/disease), The Cure Master (post-harvest), The Compliance Officer (regulations), The Strain Breeder (genetics), and The Environment Controller (climate). Provide comprehensive, actionable advice.',
    useVision: !!image,
    temperature: 0.7,
  };

  const active = providers.filter((p) => (image ? p.visionModel : p.textModel));
  for (const provider of active) {
    const result = await executeRequest(provider, request);
    if (result.success) return result.content;
  }

  return 'Unable to consult the council — no AI provider is configured. Please add a provider in Settings.';
}

// ============================================
// Multi-Model Group Deliberation (Agent-Teams pattern)
// Each group deliberates in parallel, then results are synthesized
// ============================================

export async function runMultiModelDeliberation(params: {
  topic: string;
  selectedPersonaIds: string[];
  providers: ProviderConfig[];
  context?: string;
  image?: string;
  onMessage?: (msg: CouncilMessage) => void;
  onGroupResult?: (result: GroupDeliberationResult) => void;
}): Promise<MultiModelResult> {
  const { topic, selectedPersonaIds, providers, context, image, onMessage, onGroupResult } = params;

  const selectedPersonas = COUNCIL_PERSONAS.filter((p) =>
    selectedPersonaIds.includes(p.id)
  );

  // Group personas by their group
  const groupMap = new Map<PersonaGroup, CouncilPersona[]>();
  for (const persona of selectedPersonas) {
    const group = persona.group || 'special';
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group)!.push(persona);
  }

  // Run each group in parallel (cascading aggregator pattern from Agent-Teams)
  const groupResults: GroupDeliberationResult[] = [];
  const allMessages: CouncilMessage[] = [];

  const groupPromises = Array.from(groupMap.entries()).map(async ([group, personas]) => {
    const groupInfo = PERSONA_GROUPS[group];
    const deliberations: string[] = [];

    // Each persona in the group contributes
    for (const persona of personas) {
      const prompt = buildGroupPrompt(persona, topic, group, context, deliberations);
      const content = await callPersona(persona, prompt, providers, image, 512);

      const msg: CouncilMessage = {
        id: `${persona.id}-group-${group}-${Date.now()}`,
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        content,
        timestamp: Date.now(),
        round: 'opening',
        confidence: extractConfidence(content),
        vote: extractVote(content, 'multi-model'),
      };

      allMessages.push(msg);
      deliberations.push(`**${persona.name}**: ${content}`);
      onMessage?.(msg);
    }

    // Synthesize group result
    const groupResult = await synthesizeGroupResult(
      group,
      groupInfo.name,
      personas,
      topic,
      deliberations,
      providers
    );

    groupResults.push(groupResult);
    onGroupResult?.(groupResult);
    return groupResult;
  });

  await Promise.all(groupPromises);

  // Final synthesis across all groups
  const finalSynthesis = await synthesizeMultiModelResults(
    topic,
    groupResults,
    providers
  );

  return {
    groupResults,
    synthesis: finalSynthesis.synthesis,
    consensus: finalSynthesis.consensus,
    decree: finalSynthesis.decree,
  };
}

// ============================================
// Call a Single Persona
// ============================================

async function callPersona(
  persona: CouncilPersona,
  prompt: string,
  providers: ProviderConfig[],
  image?: string,
  maxTokens = 2048
): Promise<string> {
  const request: AIRequest = {
    prompt,
    image,
    systemPrompt: persona.systemPrompt + '\n\n' + ANTI_YES_MAN,
    useVision: !!image,
    temperature: 0.7,
    maxTokens,
  };

  const activeProviders = providers.filter(
    (p) => (image ? p.visionModel : p.textModel)
  );

  if (activeProviders.length === 0) {
    return `[Unable to reach ${persona.name} — no provider configured with a ${image ? 'vision' : 'text'} model]`;
  }

  const maxRetries = 2;
  const errors: string[] = [];

  for (const provider of activeProviders) {
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

// ============================================
// Vote Synthesis with Weighted Voting & Decree
// ============================================

async function synthesizeVotes(
  topic: string,
  deliberations: string[],
  messages: CouncilMessage[],
  mode: SessionMode,
  personas: CouncilPersona[],
  providers: ProviderConfig[]
): Promise<CouncilVoteResult> {
  // Build persona vote weight info
  const personaInfo = personas.map((p) => {
    const msg = messages.filter((m) => m.personaId === p.id);
    const vote = msg[msg.length - 1]?.vote || 'abstain';
    return `${p.name} (vote weight: ${p.voteWeight || 1}, expertise: ${p.expertise.join(', ')}, voted: ${vote})`;
  }).join('\n');

  const isProposal = mode === 'proposal';

  const prompt = `You are the Council Moderator synthesizing a${isProposal ? ' proposal evaluation' : ' deliberation'} on: "${topic}"

**Council Members & Vote Weights:**
${personaInfo}

**Council Deliberations:**
${deliberations.join('\n\n---\n\n')}

Analyze the deliberations. Weight votes by each councilor's expertise relevance to the topic and their vote weight. Identify genuine disagreements — do NOT manufacture false consensus.

Return a JSON object (no markdown wrapping):
{
  "agree": <weighted percentage 0-100 who agree>,
  "disagree": <weighted percentage 0-100 who disagree>,
  "abstain": <weighted percentage 0-100 who abstained>,
  "consensus": "<one sentence summary of the majority position>",
  "dissenting": ["<list specific dissenting viewpoints with councilor names>"],
  "synthesis": "<2-3 paragraph synthesis combining all perspectives, explicitly noting areas of disagreement>",
  ${isProposal ? '"verdict": "APPROVE" | "REJECT" | "CONDITIONAL",' : ''}
  "decree": {
    "title": "<concise title for the decree>",
    "mandates": ["<actions that MUST be taken, using SHALL/MUST language>"],
    "prohibitions": ["<actions that MUST NOT be taken, using NEVER/SHALL NOT>"],
    "recommendations": ["<suggested actions using SHOULD/RECOMMENDED>"],
    "enforcementLevel": "advisory" | "recommended" | "binding"
  }
}

Return ONLY the JSON.`;

  const request: AIRequest = {
    prompt,
    systemPrompt: 'You are an impartial council moderator. Synthesize diverse expert opinions into clear consensus and actionable advice. When experts disagree, EXPLICITLY STATE THE DISAGREEMENT — do not paper over it. Generate binding decrees using MUST/SHALL/NEVER enforcement language.',
    temperature: 0.4,
    maxTokens: 2048,
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
            const decree = parsed.decree ? {
              id: `decree-${Date.now()}`,
              title: parsed.decree.title || topic,
              mandates: Array.isArray(parsed.decree.mandates) ? parsed.decree.mandates : [],
              prohibitions: Array.isArray(parsed.decree.prohibitions) ? parsed.decree.prohibitions : [],
              recommendations: Array.isArray(parsed.decree.recommendations) ? parsed.decree.recommendations : [],
              enforcementLevel: parsed.decree.enforcementLevel || 'recommended',
              dissentingViews: Array.isArray(parsed.dissenting) ? parsed.dissenting : [],
              confidenceScore: parsed.agree ?? 50,
            } : undefined;

            return {
              agree: parsed.agree ?? 60,
              disagree: parsed.disagree ?? 25,
              abstain: parsed.abstain ?? 15,
              consensus: parsed.consensus || 'Council reached a general agreement.',
              dissenting: Array.isArray(parsed.dissenting) ? parsed.dissenting : [],
              synthesis: parsed.synthesis || 'See individual councilor responses for detailed analysis.',
              decree,
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
    agree: 50,
    disagree: 25,
    abstain: 25,
    consensus: 'Council deliberation complete — see individual responses.',
    dissenting: [],
    synthesis: deliberations.join('\n\n'),
  };
}

// ============================================
// Prompt Builders
// ============================================

function buildEnhancedPrompt(
  persona: CouncilPersona,
  topic: string,
  mode: SessionMode,
  modeDesc: string,
  context?: string,
  priorDeliberations?: string[],
  round: DebateRound = 'opening',
  allPersonas?: CouncilPersona[]
): string {
  let prompt = `**COUNCIL SESSION — ${mode.toUpperCase()} MODE**
${modeDesc}

**Topic/Question:** ${topic}
`;

  if (context) {
    prompt += `\n**Context:** ${context}\n`;
  }

  // Round-specific instructions
  if (round === 'rebuttal' && priorDeliberations && priorDeliberations.length > 0) {
    prompt += `\n**REBUTTAL ROUND — Other Councilors Have Spoken:**
${priorDeliberations.join('\n\n---\n\n')}

You MUST respond to the other councilors. Where you DISAGREE, say so explicitly: "I disagree with [Name] because..."
Where you AGREE, add NEW information from your expertise — do not just repeat what they said.
Challenge weak arguments. Support strong ones with additional evidence.
`;
  } else if (round === 'closing' && priorDeliberations && priorDeliberations.length > 0) {
    prompt += `\n**CLOSING ROUND — Final Statement:**
${priorDeliberations.slice(-allPersonas!.length).join('\n\n---\n\n')}

This is your FINAL statement. Summarize your position. If you've been persuaded by other councilors, acknowledge it. If you maintain your position, restate it with conviction.
Include at the END of your response:
VOTE: [AGREE/DISAGREE/ABSTAIN]
CONFIDENCE: [0-100]
`;
  } else if (priorDeliberations && priorDeliberations.length > 0) {
    prompt += `\n**Previous Councilor Responses:**
${priorDeliberations.join('\n\n---\n\n')}

Consider the previous responses. You may agree, disagree, or build upon them.
`;
  }

  // Mode-specific additions
  if (mode === 'socratic') {
    prompt += `\nSOCRATIC METHOD: Start with a PROBING QUESTION that challenges the premise of the topic. Then provide your analysis.`;
  } else if (mode === 'emergency') {
    prompt += `\nEMERGENCY MODE: Be BRIEF. Identify the immediate threat. Recommend immediate actions. No lengthy preamble.`;
  } else if (mode === 'proposal') {
    prompt += `\nPROPOSAL EVALUATION: Evaluate this proposal. Vote APPROVE, REJECT, or CONDITIONAL APPROVAL with specific conditions. State risks and benefits.`;
  }

  prompt += `\nAs ${persona.name} (${persona.role}), provide your expert analysis. Be specific, reference your areas of expertise, and give actionable recommendations. Keep your response focused and under 500 words.`;

  return prompt;
}

function buildSwarmPrompt(
  persona: CouncilPersona,
  topic: string,
  context?: string,
  priorInsights?: string[]
): string {
  let prompt = `**SWARM INTELLIGENCE — COLLECTIVE INSIGHT**

**Topic:** ${topic}
`;

  if (context) {
    prompt += `\n**Context:** ${context}\n`;
  }

  if (priorInsights && priorInsights.length > 0) {
    prompt += `\n**Prior Insights from Other Councilors:**
${priorInsights.join('\n')}

ADD something NEW. Do not repeat what's already been said.
`;
  }

  prompt += `
As ${persona.name} (${persona.role}), contribute ONE key insight from your expertise.
Be concise — maximum 2-3 sentences. Make it count. What is the single most important thing from your perspective?`;

  return prompt;
}

// ============================================
// Extractors
// ============================================

function extractConfidence(content: string): number {
  const match = content.match(/CONFIDENCE:\s*(\d+)/i);
  return match ? Math.min(100, Math.max(0, parseInt(match[1]))) : 50;
}

function extractVote(content: string, _mode: SessionMode): 'agree' | 'disagree' | 'abstain' | undefined {
  const voteMatch = content.match(/VOTE:\s*(AGREE|DISAGREE|ABSTAIN|APPROVE|REJECT)/i);
  if (!voteMatch) return undefined;
  const v = voteMatch[1].toUpperCase();
  if (v === 'APPROVE') return 'agree';
  if (v === 'REJECT') return 'disagree';
  if (v === 'AGREE') return 'agree';
  if (v === 'DISAGREE') return 'disagree';
  return 'abstain';
}

// ============================================
// Group Deliberation Helpers (Agent-Teams pattern)
// ============================================

function buildGroupPrompt(
  persona: CouncilPersona,
  topic: string,
  group: PersonaGroup,
  context?: string,
  priorDeliberations?: string[]
): string {
  const groupInfo = PERSONA_GROUPS[group];

  let prompt = `**GROUP DELIBERATION — ${groupInfo.emoji} ${groupInfo.name.toUpperCase()}**
You are part of the ${groupInfo.name} expert group in a multi-group council deliberation.

**Topic:** ${topic}
`;

  if (context) {
    prompt += `\n**Context:** ${context}\n`;
  }

  if (priorDeliberations && priorDeliberations.length > 0) {
    prompt += `\n**Your Group's Prior Analysis:**
${priorDeliberations.join('\n\n')}

Build on these findings. Add NEW insights from your expertise — do not repeat.
`;
  }

  prompt += `
As ${persona.name} (${persona.role}), provide your expert analysis from the ${groupInfo.name} perspective.
Focus specifically on what ${groupInfo.name} experts should contribute.
Be concise — under 300 words. Be specific and actionable.

At the end, include:
VOTE: [AGREE/DISAGREE/ABSTAIN]
CONFIDENCE: [0-100]`;

  return prompt;
}

async function synthesizeGroupResult(
  group: PersonaGroup,
  groupName: string,
  personas: CouncilPersona[],
  topic: string,
  deliberations: string[],
  providers: ProviderConfig[]
): Promise<GroupDeliberationResult> {
  const prompt = `You are synthesizing the ${groupName} group's deliberation on: "${topic}"

**Group Members:** ${personas.map((p) => p.name).join(', ')}

**Deliberations:**
${deliberations.join('\n\n---\n\n')}

Provide:
1. A concise group summary (1 paragraph)
2. The group's overall vote (AGREE/DISAGREE/ABSTAIN)
3. Confidence level (0-100)
4. Top 3 key points from the group

Return JSON:
{
  "summary": "...",
  "vote": "agree" | "disagree" | "abstain",
  "confidence": 0-100,
  "keyPoints": ["point1", "point2", "point3"]
}

Return ONLY the JSON.`;

  const request: AIRequest = {
    prompt,
    systemPrompt: `You are the ${groupName} group coordinator. Synthesize the group's deliberation into a clear, concise result.`,
    temperature: 0.4,
    maxTokens: 512,
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
              group,
              groupName,
              personas: personas.map((p) => p.name),
              summary: parsed.summary || 'Group deliberation complete.',
              vote: parsed.vote || 'abstain',
              confidence: parsed.confidence || 50,
              keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
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
    group,
    groupName,
    personas: personas.map((p) => p.name),
    summary: deliberations.join('\n\n'),
    vote: 'abstain',
    confidence: 50,
    keyPoints: [],
  };
}

async function synthesizeMultiModelResults(
  topic: string,
  groupResults: GroupDeliberationResult[],
  providers: ProviderConfig[]
): Promise<{ synthesis: string; consensus: number; decree?: CouncilDecree }> {
  const groupSummaries = groupResults.map((gr) =>
    `**${gr.groupName}** (${gr.vote}, ${gr.confidence}% confidence):\n${gr.summary}\nKey points: ${gr.keyPoints.join('; ')}`
  ).join('\n\n---\n\n');

  const agreeGroups = groupResults.filter((gr) => gr.vote === 'agree').length;
  const totalGroups = groupResults.length;
  const consensus = Math.round((agreeGroups / totalGroups) * 100);

  const prompt = `You are synthesizing a multi-group council deliberation on: "${topic}"

**Group Results:**
${groupSummaries}

**Group Consensus:** ${consensus}% of groups agree (${agreeGroups}/${totalGroups})

Provide:
1. A unified synthesis (2-3 paragraphs) combining all group perspectives
2. A binding decree with mandates, prohibitions, and recommendations

Return JSON:
{
  "synthesis": "...",
  "decree": {
    "title": "...",
    "mandates": ["MUST actions..."],
    "prohibitions": ["MUST NOT actions..."],
    "recommendations": ["SHOULD actions..."],
    "enforcementLevel": "advisory" | "recommended" | "binding"
  }
}

Return ONLY the JSON.`;

  const request: AIRequest = {
    prompt,
    systemPrompt: 'You are the Council Synthesis Lead. Combine multi-group deliberation results into a unified verdict with binding decrees using MUST/SHALL/NEVER enforcement language.',
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
            const decree = parsed.decree ? {
              id: `decree-${Date.now()}`,
              title: parsed.decree.title || topic,
              mandates: Array.isArray(parsed.decree.mandates) ? parsed.decree.mandates : [],
              prohibitions: Array.isArray(parsed.decree.prohibitions) ? parsed.decree.prohibitions : [],
              recommendations: Array.isArray(parsed.decree.recommendations) ? parsed.decree.recommendations : [],
              enforcementLevel: parsed.decree.enforcementLevel || 'recommended',
              dissentingViews: groupResults.filter((gr) => gr.vote === 'disagree').map((gr) => `${gr.groupName}: ${gr.summary}`),
              confidenceScore: consensus,
            } : undefined;

            return {
              synthesis: parsed.synthesis || 'Multi-group deliberation complete.',
              consensus,
              decree,
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
    synthesis: groupSummaries,
    consensus,
  };
}
