// ============================================
// CannaAI Plant Doctor Agent Engine
// Full agentic loop: Plan → Observe → Think → Act → Reflect
// ============================================

import type {
  ProviderConfig,
  PlantAnalysisResult,
  AgentPlan,
  AgentReflection,
  PlantMemoryEntry,
  PlantProfile,
  AgentContextSummary,
  AgentHypothesis,
  StructuredObservation,
  ToolEvidence,
} from '../types';
import { executeRequest } from './ai-providers';
import { getToolDescriptions, getTool, setToolProviders } from './agent-tools';
import { councilReviewDiagnosis, type CouncilReviewResult } from './team-orchestrator';
import { validateAndFillDefaults } from './analysis';
import { loadTemperatureUnit, celsiusToFahrenheit } from '../utils/storage';

// --- Parsed Response Type ---

interface ParsedAgentResponse {
  thinking?: string;
  action?: string;
  plan?: { goal?: string; tasks?: Array<Record<string, unknown>> };
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  message_to_user?: string;
  diagnosis?: Partial<PlantAnalysisResult>;
  reflection?: {
    adjusted_confidence?: number;
    gaps?: string[];
    weaknesses?: string[];
    recommendation?: string;
  };
}

// --- Exported Types ---

export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'thinking'
  | 'using_tool'
  | 'reflecting'
  | 'asking_user'
  | 'done'
  | 'error';

export interface AgentMessage {
  id: string;
  role: 'agent' | 'user' | 'tool' | 'system' | 'plan' | 'reflection';
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  thinking?: string;
  internal?: boolean; // hidden from user UI
  imageData?: string; // for user messages with follow-up photos
}

export interface AgentSession {
  id: string;
  messages: AgentMessage[];
  status: AgentStatus;
  result?: PlantAnalysisResult;
  pendingQuestions?: string[];
  observations: string[];
  toolCalls: number;
  maxToolCalls: number;
  // New agent framework fields
  plan?: AgentPlan;
  reflections: AgentReflection[];
  currentTaskId?: string;
  contextSummary?: AgentContextSummary;
  confidence: number;
  plantMemory: PlantMemoryEntry[];
  phase: 'plan' | 'execute' | 'reflect' | 'done';
  // Enhanced tracking
  structuredObservations: StructuredObservation[];
  hypotheses: AgentHypothesis[];
  evidenceLog: ToolEvidence[];
  activeHypothesisId?: string;
  // Council review (from Agent-Teams pattern)
  councilReview?: CouncilReviewResult;
}

// --- Plant Memory (localStorage) ---

const MEMORY_KEY = 'cannaai_plant_profiles';

function loadPlantProfiles(): PlantProfile[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function savePlantProfiles(profiles: PlantProfile[]): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(profiles));
  } catch { /* ignore */ }
}

function findRelevantMemory(
  profiles: PlantProfile[],
  strain?: string,
  symptoms?: string[]
): PlantMemoryEntry[] {
  const entries: PlantMemoryEntry[] = [];
  for (const profile of profiles) {
    if (strain && profile.strain?.toLowerCase().includes(strain.toLowerCase())) {
      entries.push(...profile.entries.slice(-3));
    }
    if (symptoms?.length) {
      for (const entry of profile.entries) {
        const hasOverlap = entry.keyFindings.some((f) =>
          symptoms.some((s) => f.toLowerCase().includes(s.toLowerCase()))
        );
        if (hasOverlap) entries.push(entry);
      }
    }
    // Also grab most recent entries from any profile
    if (entries.length === 0) {
      entries.push(...profile.entries.slice(-1));
    }
  }
  // Deduplicate and limit
  const seen = new Set<string>();
  return entries
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .slice(-5);
}

// --- System Prompt ---

const AGENT_SYSTEM_PROMPT = `You are **CannaAI Plant Doctor** — an autonomous plant diagnostic agent with planning, reasoning, tool use, and self-reflection capabilities. You specialize in cannabis/hemp plant health analysis.

## Agent Architecture

You operate in a structured loop:
1. **PLAN**: Break the analysis into specific tasks
2. **OBSERVE**: Gather all available information
3. **THINK**: Reason about what you observe, form hypotheses
4. **ACT**: Use tools to gather data and verify hypotheses
5. **REFLECT**: Critically evaluate your findings before presenting them
6. **DIAGNOSE**: Provide a confident, evidence-based diagnosis

## CRITICAL RULES
- EVERY response MUST include a tool call (action=tool_call) unless you are calling generate_diagnosis, request_more_info, or ask_user
- Do NOT just talk about what you plan to do — actually DO it by calling a tool
- Do NOT return conversational text without a tool call — this wastes iterations
- If an IMAGE is attached, your FIRST priority is to analyze it visually. Describe what you see in the image in your thinking, then use tools to cross-reference your visual observations. Do NOT ask the user to describe symptoms that are already visible in the image.
- If you have observations/symptoms, your FIRST action MUST be calling match_symptoms
- If you have a strain name, call lookup_strain
- If you have environmental data, call check_environment
- After gathering evidence, call generate_diagnosis
- NEVER ask the user to describe what you can see in an attached image — analyze it yourself first

## Evidence Tracking
You have access to tracked evidence, hypotheses, and structured observations from this session. Use this context to:
- Avoid re-checking information already gathered
- Build on previous findings rather than starting from scratch
- Reference specific evidence when forming your diagnosis
- Update or rule out hypotheses as new evidence comes in

## Tool Usage Rules
- Start with \`match_symptoms\` if symptoms are provided
- Use \`lookup_strain\` if a strain is known (to get strain-specific issues)
- Use \`check_environment\` if environmental data is provided
- Use \`check_lockout\` if pH data is available
- Use \`growth_stage_check\` to validate growth stage context
- Use \`calculate_vpd\` for detailed transpiration analysis
- Use \`get_deficiency_guide\` when you suspect a specific deficiency
- Use \`calculate_feed_schedule\` for nutrient recommendations
- Use \`assess_trichome_harvest\` for harvest timing questions
- Use \`grow_schedule_advisor\` for grow timeline planning
- Use \`self_critique\` before finalizing to verify your diagnosis
- When confident, call \`generate_diagnosis\` with your findings
- If critical info is missing, call \`request_more_info\`
- Maximum 4 tool calls per session — be efficient, combine related checks, and prioritize the most informative tools first
- IMPORTANT: Reference tracked evidence in your thinking — don't ignore what's already been gathered

## Response Format
Each response MUST be a JSON object:
{
  "thinking": "Your detailed internal reasoning — what you observe, what hypotheses you're forming, what you plan to do next",
  "action": "plan" | "tool_call" | "diagnose" | "ask_user" | "reflect",
  "plan": { "goal": "...", "tasks": [...] } (if action=plan),
  "tool_name": "name of tool (if action=tool_call)",
  "tool_args": { ... } (if action=tool_call),
  "message_to_user": "A friendly message explaining what you're doing",
  "diagnosis": { ... } (if action=diagnose — full PlantAnalysisResult),
  "reflection": { ... } (if action=reflect — self-critique)
}

## Diagnosis Structure (when action=diagnose)
{
  "diagnosis": "Specific diagnosis (e.g., 'Magnesium Deficiency in Late Flowering')",
  "summary": "2-3 sentence overview",
  "urgency": "low|medium|high|critical",
  "urgencyReasons": ["reason1", "reason2"],
  "healthScore": 0-100,
  "healthScoreBreakdown": {
    "vigor": {"score": 0-100, "rationale": "..."},
    "leafCondition": {"score": 0-100, "rationale": "..."},
    "pestFree": {"score": 0-100, "rationale": "..."},
    "environmentOptimal": {"score": 0-100, "rationale": "..."},
    "growthStageAppropriate": {"score": 0-100, "rationale": "..."},
    "rootHealth": {"score": 0-100, "rationale": "..."}
  },
  "likelyCauses": [{"cause": "...", "confidence": 0-100, "evidence": "...", "rationale": "..."}],
  "evidenceObservations": ["obs1", "obs2"],
  "uncertainties": ["limitation1"],
  "recommendations": {"immediate": [...], "shortTerm": [...], "longTerm": [...]},
  "detectedIssues": [{"type": "...", "name": "...", "severity": "...", "confidence": 0-100, "evidence": "...", "treatment": "..."}],
  "confidence": 0-100,
  "prognosis": "...",
  "followUpSchedule": "..."
}

Return ONLY the JSON object. No markdown wrapping.`;

// --- Agent Engine ---

export class PlantDoctorAgent {
  private session: AgentSession;
  private providers: ProviderConfig[];
  private onUpdate: (session: AgentSession) => void;
  private image?: string;
  private deadline = 0;

  constructor(
    providers: ProviderConfig[],
    onUpdate: (session: AgentSession) => void
  ) {
    this.providers = providers;
    this.onUpdate = onUpdate;
    this.session = {
      id: `agent-${Date.now()}`,
      messages: [],
      status: 'idle',
      observations: [],
      toolCalls: 0,
      maxToolCalls: 4,
      reflections: [],
      confidence: 0,
      plantMemory: [],
      phase: 'plan',
      structuredObservations: [],
      hypotheses: [],
      evidenceLog: [],
    };
  }

  private setDeadline(ms: number): void {
    this.deadline = Date.now() + ms;
  }

  private isExpired(): boolean {
    return this.deadline > 0 && Date.now() > this.deadline;
  }

  getSession(): AgentSession {
    return { ...this.session };
  }

  async start(observations: {
    image?: string;
    symptoms?: string[];
    strain?: string;
    growthStage?: string;
    medium?: string;
    phLevel?: number;
    temperature?: number;
    humidity?: number;
    notes?: string;
  }): Promise<void> {
    this.image = observations.image;
    this.setDeadline(5 * 60 * 1000); // 5 minute overall deadline

    // Inject providers into tools so consult_council can access them
    setToolProviders(this.providers);

    // Build initial observation message
    const obsParts: string[] = [];
    if (observations.strain) obsParts.push(`Strain: ${observations.strain}`);
    if (observations.growthStage) obsParts.push(`Growth stage: ${observations.growthStage}`);
    if (observations.medium) obsParts.push(`Medium: ${observations.medium}`);
    if (observations.phLevel !== undefined) obsParts.push(`pH: ${observations.phLevel}`);
    if (observations.temperature !== undefined) {
      const unit = loadTemperatureUnit();
      const displayTemp = unit === 'F' ? celsiusToFahrenheit(observations.temperature) : observations.temperature;
      obsParts.push(`Temperature: ${displayTemp}°${unit}`);
    }
    if (observations.humidity !== undefined) obsParts.push(`Humidity: ${observations.humidity}%`);
    if (observations.symptoms?.length) obsParts.push(`Symptoms: ${observations.symptoms.join(', ')}`);
    if (observations.notes) obsParts.push(`Notes: ${observations.notes}`);
    if (observations.image) obsParts.push('[IMAGE ATTACHED — analyze visual symptoms]');

    this.session.observations = obsParts;

    // Parse structured observations from input
    if (observations.strain) this.addStructuredObservation('strain', observations.strain, 'user');
    if (observations.growthStage) this.addStructuredObservation('growth_stage', observations.growthStage, 'user');
    if (observations.medium) this.addStructuredObservation('medium', observations.medium, 'user');
    if (observations.phLevel !== undefined) this.addStructuredObservation('ph_level', String(observations.phLevel), 'user');
    if (observations.temperature !== undefined) this.addStructuredObservation('temperature', String(observations.temperature), 'user');
    if (observations.humidity !== undefined) this.addStructuredObservation('humidity', String(observations.humidity), 'user');
    if (observations.symptoms?.length) {
      for (const s of observations.symptoms) {
        this.addStructuredObservation(`symptom:${s.toLowerCase()}`, 'present', 'user');
      }
    }
    if (observations.image) this.addStructuredObservation('image', 'attached', 'user');

    // Load plant memory
    const profiles = loadPlantProfiles();
    const memory = findRelevantMemory(profiles, observations.strain, observations.symptoms);
    this.session.plantMemory = memory;

    const userMsg: AgentMessage = {
      id: this.nextId('msg'),
      role: 'user',
      content: `Analyze this plant:\n${obsParts.join('\n')}`,
      timestamp: Date.now(),
    };

    this.session.messages.push(userMsg);
    this.session.status = 'planning';
    this.onUpdate({ ...this.session });

    // Start with planning phase
    try {
      await this.runPlanPhase();
    } catch (err) {
      this.session.status = 'error';
      this.addSystemMessage(`Agent failed to start: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.onUpdate({ ...this.session });
    }

    // Safety net: ensure terminal status when start() returns
    this.ensureTerminalStatus();
  }

  async continueWithUserResponse(response: string, image?: string): Promise<void> {
    this.setDeadline(3 * 60 * 1000); // 3 minute deadline for continuation

    const userMsg: AgentMessage = {
      id: this.nextId('msg'),
      role: 'user',
      content: response,
      timestamp: Date.now(),
      imageData: image,
    };
    this.session.messages.push(userMsg);
    if (image) this.image = image;
    this.session.status = 'thinking';
    this.session.phase = 'execute';
    this.onUpdate({ ...this.session });

    // Parse structured observations from user's response
    this.parseObservationsFromUserInput();

    try {
      await this.runExecutionLoop();
    } catch (err) {
      this.session.status = 'error';
      this.addSystemMessage(`Agent error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.onUpdate({ ...this.session });
    }

    this.ensureTerminalStatus();
  }

  async followUp(response: string, image?: string): Promise<void> {
    const provider = this.getProvider();
    if (!provider) return;

    this.setDeadline(3 * 60 * 1000); // 3 minute deadline for follow-ups

    const userMsg: AgentMessage = {
      id: this.nextId('msg'),
      role: 'user',
      content: response,
      timestamp: Date.now(),
      imageData: image,
    };
    this.session.messages.push(userMsg);
    this.session.status = 'thinking';
    this.onUpdate({ ...this.session });

    // Update stored image for vision-capable follow-ups
    const followUpImage = image || this.image;

    const resultSummary = this.session.result
      ? `\n\nDIAGNOSIS CONTEXT:\nDiagnosis: ${this.session.result.diagnosis}\nHealth Score: ${this.session.result.healthScore}/100\nUrgency: ${this.session.result.urgency}\nSummary: ${this.session.result.summary}\nPrognosis: ${this.session.result.prognosis}`
      : '';

    const toolResults = this.session.messages
      .filter((m) => m.role === 'tool')
      .map((m) => `[${m.toolName}]: ${m.content.substring(0, 300)}`)
      .join('\n');

    // Build evidence context from tracking system
    const evidenceContext = this.buildEvidenceSummary();

    const followUpSystemPrompt = `You are CannaAI Plant Doctor — a friendly, knowledgeable cannabis plant health advisor. You have already completed a diagnosis for this plant and are now in follow-up conversation mode.

Your role is to:
- Answer the user's questions about the diagnosis, treatment plan, or plant health in general
- Provide additional detail or clarification on any recommendation
- Suggest alternative approaches if the user asks
- Help the user understand what to expect going forward
- Use tools if the user's question requires looking up specific information (strain data, nutrient guides, etc.)

Be conversational, helpful, and thorough. You may use tools if needed — available tools:\n${getToolDescriptions()}
${resultSummary}
${evidenceContext ? `\n\nACCUMULATED EVIDENCE:\n${evidenceContext}` : ''}
${toolResults ? `\n\nPREVIOUS TOOL RESULTS:\n${toolResults}` : ''}

${loadTemperatureUnit() === 'F' ? '\nTEMPERATURE UNIT: Use Fahrenheit (°F) for ALL temperature references. Do NOT use Celsius.\n' : ''}
IMPORTANT: You MUST respond with a valid JSON object. Do NOT include any text before or after the JSON.

The JSON format is:
{
  "thinking": "Your reasoning about the user's question",
  "action": "tool_call" | "respond",
  "tool_name": "name of tool (only if action is tool_call)",
  "tool_args": { ... } (only if action is tool_call),
  "message_to_user": "Your helpful response to the user's question. This is REQUIRED for both tool_call and respond actions."
}

Always include the "message_to_user" field — it is your response that the user will see.
If you need to use a tool, set action to "tool_call" and include tool_name and tool_args, but ALSO include message_to_user to tell the user what you're doing.
If you don't need a tool, set action to "respond" and put your full answer in message_to_user.`;

    // Build conversation history with role labels and truncation
    const conversationHistory = this.session.messages
      .slice(-15)
      .map((m) => {
        if (m.role === 'user') {
          const imgNote = m.imageData ? ' [Photo attached]' : '';
          return `USER: ${m.content}${imgNote}`;
        }
        if (m.role === 'agent') return `ASSISTANT: ${m.content}`;
        if (m.role === 'tool') return `[Tool ${m.toolName}]: ${m.content.substring(0, 300)}`;
        if (m.role === 'system') return `[System]: ${m.content}`;
        return `[${m.role}]: ${m.content}`;
      })
      .join('\n\n');

    try {
      await this.runFollowUpLoop(provider, followUpSystemPrompt, conversationHistory, followUpImage);
    } catch (err) {
      this.session.status = 'error';
      this.addSystemMessage(`Follow-up error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.onUpdate({ ...this.session });
    }

    this.ensureTerminalStatus();
  }

  private async runFollowUpLoop(
    provider: ProviderConfig,
    systemPrompt: string,
    conversationHistory: string,
    followUpImage?: string
  ): Promise<void> {
    let toolCallsUsed = 0;
    const maxFollowUpTools = 2;

    while (toolCallsUsed < maxFollowUpTools) {
      let response;
      try {
        response = await executeRequest(provider, {
          prompt: conversationHistory,
          image: followUpImage,
          systemPrompt,
          temperature: 0.5,
          maxTokens: 2048,
          timeout: 60000,
        });
      } catch (err) {
        this.addSystemMessage(`Request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        break;
      }

      if (!response.success) {
        this.addSystemMessage(`AI error: ${response.error}`);
        break;
      }

      const parsed = this.parseAgentResponse(response.content);

      // If parsing failed entirely, use raw content as the response
      if (!parsed) {
        const rawText = response.content.trim();
        if (rawText) {
          this.addAgentMessage(rawText);
        }
        break;
      }

      // Handle tool calls
      if (parsed.action === 'tool_call' && parsed.tool_name) {
        const tool = getTool(parsed.tool_name as string);
        if (!tool) {
          // Tool not found — add explanation as message and stop
          const msg = parsed.message_to_user || `I tried to use a tool (${parsed.tool_name}) that isn't available.`;
          this.addAgentMessage(msg as string);
          break;
        }

        this.session.status = 'using_tool';
        this.onUpdate({ ...this.session });

        let toolResult: string;
        try {
          toolResult = await tool.execute((parsed.tool_args || {}) as Record<string, unknown>);
        } catch (err) {
          toolResult = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool failed' });
        }

        toolCallsUsed++;
        this.session.toolCalls++;

        // Log evidence from follow-up tool call
        this.logToolEvidence(parsed.tool_name as string, toolResult);

        const toolMsg: AgentMessage = {
          id: `tool-${Date.now()}`,
          role: 'tool',
          content: toolResult,
          timestamp: Date.now(),
          toolName: parsed.tool_name as string,
          toolArgs: parsed.tool_args as Record<string, unknown>,
          toolResult,
        };
        this.session.messages.push(toolMsg);

        // Always show a message to the user after tool use
        if (parsed.message_to_user) {
          this.addAgentMessage(parsed.message_to_user as string);
        }

        conversationHistory += `\n\n[Tool Result — ${parsed.tool_name}]:\n${toolResult}`;
        // Continue loop to let agent respond after tool result

      } else {
        // Direct response (action=respond or any non-tool action)
        const msg = parsed.message_to_user || parsed.thinking || response.content.trim();
        if (msg) {
          this.addAgentMessage(msg);
        }
        break;
      }
    }

    this.session.status = 'done';
    this.onUpdate({ ...this.session });
  }

  // --- Planning Phase ---

  private async runPlanPhase(): Promise<void> {
    const provider = this.getProvider();
    if (!provider) return;

    const memoryContext = this.session.plantMemory.length > 0
      ? `\n\nPLANT MEMORY (past analyses):\n${this.session.plantMemory.map((e) =>
          `- ${e.diagnosis} (score: ${e.healthScore}, ${new Date(e.timestamp).toLocaleDateString()}): ${e.keyFindings.join(', ')}`
        ).join('\n')}`
      : '';

    const prompt = `You are planning a plant diagnosis. Based on the initial observations, create a structured plan of analysis tasks.

Initial observations:
${this.session.observations.join('\n')}
${memoryContext}

Create a plan with specific tasks. Respond with ONLY this JSON:
{
  "thinking": "Your reasoning about what needs to be investigated",
  "action": "plan",
  "plan": {
    "goal": "One-sentence goal for this analysis",
    "tasks": [
      {"id": "task_1", "label": "Short label", "description": "What this task does", "toolName": "tool_to_use"},
      ...
    ]
  },
  "message_to_user": "Brief explanation of your plan"
}`;

    const tempUnitInstruction = loadTemperatureUnit() === 'F'
      ? '\n\nTEMPERATURE UNIT: Use Fahrenheit (°F) for ALL temperature references. Do NOT use Celsius.'
      : '';

    let response;
    const maxPlanRetries = 3;
    for (let attempt = 0; attempt < maxPlanRetries; attempt++) {
      try {
        response = await executeRequest(provider, {
          prompt,
          image: this.image,
          systemPrompt: AGENT_SYSTEM_PROMPT + '\n\nAvailable tools:\n' + getToolDescriptions() + tempUnitInstruction,
          temperature: 0.4,
          maxTokens: 2048,
          timeout: 60000,
        });
        if (response.success) break;
      } catch (err) {
        response = { success: false, content: '', model: '', provider: provider.name, error: err instanceof Error ? err.message : 'Request failed' };
      }
      // Wait before retrying
      if (attempt < maxPlanRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!response!.success) {
      // Fallback: skip planning, go straight to execution
      this.session.status = 'thinking';
      this.session.phase = 'execute';
      this.onUpdate({ ...this.session });
      await this.runExecutionLoop();
      return;
    }

    const parsed = this.parseAgentResponse(response!.content);

    if (parsed?.action === 'plan' && parsed.plan) {
      const plan: AgentPlan = {
        id: `plan-${Date.now()}`,
        goal: parsed.plan.goal || 'Diagnose plant health',
        tasks: (parsed.plan.tasks || []).map((t: Record<string, unknown>, i: number) => ({
          id: String(t.id || `task_${i + 1}`),
          label: String(t.label || `Task ${i + 1}`),
          description: String(t.description || ''),
          status: 'pending' as const,
          toolName: t.toolName ? String(t.toolName) : undefined,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'executing',
      };

      this.session.plan = plan;

      const planMsg: AgentMessage = {
        id: `plan-${Date.now()}`,
        role: 'plan',
        content: parsed.message_to_user || 'Created analysis plan.',
        timestamp: Date.now(),
        thinking: parsed.thinking,
      };
      this.session.messages.push(planMsg);
      this.session.status = 'thinking';
      this.session.phase = 'execute';
      this.onUpdate({ ...this.session });

      await this.runExecutionLoop();
    } else {
      // LLM didn't return a plan — proceed directly
      this.session.status = 'thinking';
      this.session.phase = 'execute';
      this.onUpdate({ ...this.session });
      await this.runExecutionLoop();
    }
  }

  // --- Execution Loop ---

  private async runExecutionLoop(): Promise<void> {
    const provider = this.getProvider();
    if (!provider) return;

    let iterationsWithoutTool = 0;
    const maxIterationsWithoutTool = 3; // Bail out if agent can't figure out a tool to use
    let consecutiveApiErrors = 0;
    const maxApiRetries = 3;

    while (this.session.toolCalls < this.session.maxToolCalls) {
      // Check overall deadline
      if (this.isExpired()) {
        this.addSystemMessage('Agent execution timed out. Generating diagnosis from available evidence...', true);
        await this.forceDiagnosis(provider);
        return;
      }

      // Summarize context if getting long
      if (this.session.messages.length > 20) {
        this.compressContext();
      }

      const llmMessages = this.buildLLMMessages();

      const response = await executeRequest(provider, {
        prompt: llmMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n'),
        image: this.image,
        systemPrompt: AGENT_SYSTEM_PROMPT + '\n\nAvailable tools:\n' + getToolDescriptions() + this.buildContextPrompt(),
        temperature: 0.4,
        maxTokens: 8192,
        timeout: 60000, // 60s per call — keeps the agent responsive
      });

      if (!response.success) {
        consecutiveApiErrors++;
        if (consecutiveApiErrors < maxApiRetries) {
          // Transient failure — wait briefly and retry
          await new Promise((r) => setTimeout(r, 1000 * consecutiveApiErrors));
          continue;
        }
        this.session.status = 'error';
        this.addSystemMessage(`AI error after ${maxApiRetries} retries: ${response.error}`);
        this.onUpdate({ ...this.session });
        return;
      }

      // Reset error counter on successful response
      consecutiveApiErrors = 0;

      const parsed = this.parseAgentResponse(response.content);

      if (!parsed) {
        iterationsWithoutTool++;
        if (iterationsWithoutTool >= maxIterationsWithoutTool) {
          this.addSystemMessage('Generating diagnosis from available evidence...', true);
          await this.forceDiagnosis(provider);
          return;
        }
        // Silently retry — don't show raw/unparseable content to user
        continue;
      }

      // Record thinking
      if (parsed.thinking) {
        const thinkMsg: AgentMessage = {
          id: `think-${Date.now()}`,
          role: 'agent',
          content: parsed.message_to_user || '',
          timestamp: Date.now(),
          thinking: parsed.thinking,
        };
        this.session.messages.push(thinkMsg);
      } else if (parsed.message_to_user) {
        this.addAgentMessage(parsed.message_to_user);
      }

      // Update plan task progress
      if (parsed.tool_name && this.session.plan) {
        const matchingTask = this.session.plan.tasks.find(
          (t) => t.toolName === parsed.tool_name && t.status === 'pending'
        );
        if (matchingTask) {
          matchingTask.status = 'in_progress';
          matchingTask.startedAt = Date.now();
          this.session.currentTaskId = matchingTask.id;
        }
      }

      // Execute action
      if (parsed.action === 'tool_call' && parsed.tool_name) {
        this.session.status = 'using_tool';
        this.onUpdate({ ...this.session });

        const tool = getTool(parsed.tool_name);
        if (!tool) {
          this.addSystemMessage(`Unknown tool: ${parsed.tool_name}. Skipping.`, true);
          iterationsWithoutTool++;
          if (iterationsWithoutTool >= maxIterationsWithoutTool) {
            this.addSystemMessage('Agent keeps requesting invalid tools. Generating diagnosis from available evidence...', true);
            await this.forceDiagnosis(provider);
            return;
          }
          continue;
        }

        const toolArgs = parsed.tool_args || {};
        let toolResult: string;
        try {
          toolResult = await tool.execute(toolArgs);
        } catch (err) {
          toolResult = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
          iterationsWithoutTool++;
        }

        this.session.toolCalls++;
        iterationsWithoutTool = 0; // Reset counter on successful tool use

        // Log evidence from tool result
        this.logToolEvidence(parsed.tool_name, toolResult);

        // Mark task complete
        if (this.session.plan && this.session.currentTaskId) {
          const task = this.session.plan.tasks.find((t) => t.id === this.session.currentTaskId);
          if (task) {
            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = toolResult.substring(0, 200);
          }
          this.session.currentTaskId = undefined;
        }

        const toolMsg: AgentMessage = {
          id: `tool-${Date.now()}`,
          role: 'tool',
          content: toolResult,
          timestamp: Date.now(),
          toolName: parsed.tool_name,
          toolArgs,
          toolResult,
        };
        this.session.messages.push(toolMsg);

        // Terminal tools
        if (parsed.tool_name === 'generate_diagnosis') {
          try {
            const resultData = JSON.parse(toolResult);
            if (resultData.status === 'diagnosis_complete') {
              // Finalize directly — skip extra reflection API call
              try {
                this.session.result = validateAndFillDefaults(resultData);
                this.saveToMemory();
                if (this.session.plan) {
                  this.session.plan.status = 'complete';
                  this.session.plan.updatedAt = Date.now();
                }
                // Run council review (Agent-Teams QA pattern)
                await this.runCouncilReview();
                this.session.status = 'done';
                this.session.phase = 'done';
              } catch {
                this.session.status = 'error';
                this.addSystemMessage('Could not parse final diagnosis.');
              }
              this.onUpdate({ ...this.session });
              return;
            }
          } catch { /* continue */ }
        }

        if (parsed.tool_name === 'request_more_info') {
          try {
            const resultData = JSON.parse(toolResult);
            if (resultData.status === 'needs_more_info') {
              this.session.pendingQuestions = resultData.questions;
              this.session.status = 'asking_user';
              this.onUpdate({ ...this.session });
              return;
            }
          } catch { /* continue */ }
        }

        this.session.status = 'thinking';
        this.onUpdate({ ...this.session });

      } else if (parsed.action === 'diagnose' && parsed.diagnosis) {
        // Finalize directly — skip extra reflection API call
        try {
          this.session.result = validateAndFillDefaults(parsed.diagnosis);
          this.saveToMemory();
          if (this.session.plan) {
            this.session.plan.status = 'complete';
            this.session.plan.updatedAt = Date.now();
          }
          // Run council review (Agent-Teams QA pattern)
          await this.runCouncilReview();
          this.session.status = 'done';
          this.session.phase = 'done';
        } catch {
          this.session.status = 'error';
          this.addSystemMessage('Could not parse the diagnosis.');
        }
        this.onUpdate({ ...this.session });
        return;

      } else if (parsed.action === 'reflect') {
        // Self-reflection
        const reflection: AgentReflection = {
          id: `refl-${Date.now()}`,
          stage: 'pre_diagnosis',
          confidence: parsed.reflection?.adjusted_confidence || 50,
          gaps: parsed.reflection?.gaps || [],
          contradictions: parsed.reflection?.weaknesses || [],
          needsMoreInfo: (parsed.reflection?.weaknesses?.length || 0) >= 2,
          suggestedNextAction: parsed.reflection?.recommendation || 'continue',
          reasoning: parsed.thinking || '',
          timestamp: Date.now(),
        };
        this.session.reflections.push(reflection);
        this.session.confidence = reflection.confidence;

        const reflMsg: AgentMessage = {
          id: `refl-${Date.now()}`,
          role: 'reflection',
          content: reflection.suggestedNextAction,
          timestamp: Date.now(),
          thinking: reflection.reasoning,
        };
        this.session.messages.push(reflMsg);

        iterationsWithoutTool++;
        if (iterationsWithoutTool >= maxIterationsWithoutTool) {
          this.addSystemMessage('Agent spent too many iterations reflecting. Finalizing...', true);
          await this.forceDiagnosis(provider);
          return;
        }

        if (reflection.needsMoreInfo && this.session.toolCalls < this.session.maxToolCalls - 1) {
          this.session.status = 'thinking';
          this.onUpdate({ ...this.session });
          continue;
        }

        this.session.status = 'thinking';
        this.onUpdate({ ...this.session });

      } else if (parsed.action === 'ask_user') {
        this.session.pendingQuestions = [parsed.message_to_user || 'I need more information to continue.'];
        this.session.status = 'asking_user';
        this.onUpdate({ ...this.session });
        return;

      } else if (parsed.action === 'plan') {
        // LLM returned a plan mid-loop — acknowledge and continue
        iterationsWithoutTool++;
        if (iterationsWithoutTool >= maxIterationsWithoutTool) {
          this.addSystemMessage('Agent stuck in planning loop. Generating diagnosis from available evidence...', true);
          await this.forceDiagnosis(provider);
          return;
        }
        this.session.status = 'thinking';
        this.onUpdate({ ...this.session });

      } else if (parsed.message_to_user || parsed.thinking) {
        // LLM returned a conversational response without a tool call.
        iterationsWithoutTool++;
        if (iterationsWithoutTool >= maxIterationsWithoutTool) {
          this.addSystemMessage('Agent is not using tools effectively. Generating diagnosis from available evidence...', true);
          await this.forceDiagnosis(provider);
          return;
        }
        this.session.status = 'thinking';
        this.onUpdate({ ...this.session });

      } else {
        // Unrecognized response format — treat as conversational and let
        // the loop retry rather than failing immediately
        iterationsWithoutTool++;
        if (iterationsWithoutTool >= maxIterationsWithoutTool) {
          this.addSystemMessage('Agent is not producing actionable responses. Generating diagnosis from available evidence...', true);
          await this.forceDiagnosis(provider);
          return;
        }
        this.session.status = 'thinking';
        this.onUpdate({ ...this.session });
      }
    }

    // Max tool calls reached — finalize immediately without extra API call
    if (this.session.status !== 'done' && this.session.status !== 'error') {
      this.addSystemMessage('Reached maximum tool calls. Finalizing diagnosis from gathered evidence...', true);
      await this.forceDiagnosis(provider); // skipReflection = true
    }
  }

  // --- Force Diagnosis ---

  private async forceDiagnosis(provider: ProviderConfig): Promise<void> {
    this.addSystemMessage('Forcing diagnosis from accumulated evidence...', true);

    const evidenceSummary = this.session.messages
      .filter((m) => m.role === 'tool')
      .map((m) => `[${m.toolName}]: ${m.content.substring(0, 500)}`)
      .join('\n\n');

    // Include tracked evidence and hypotheses
    const trackedEvidence = this.buildEvidenceSummary();

    const prompt = `Generate a final plant diagnosis based on the available information.

${evidenceSummary ? `Evidence from tools:\n${evidenceSummary}` : 'No tool evidence was gathered — base your analysis on the observations below.'}
${trackedEvidence ? `\n\nTRACKED EVIDENCE & HYPOTHESES:\n${trackedEvidence}` : ''}

Observations: ${this.session.observations.join('\n')}

You MUST return a JSON object with these fields:
{
  "action": "diagnose",
  "diagnosis": {
    "diagnosis": "Specific diagnosis",
    "summary": "2-3 sentence overview",
    "urgency": "low|medium|high|critical",
    "urgencyReasons": ["reason"],
    "healthScore": 0-100,
    "healthScoreBreakdown": {
      "vigor": {"score": 0-100, "rationale": "..."},
      "leafCondition": {"score": 0-100, "rationale": "..."},
      "pestFree": {"score": 0-100, "rationale": "..."},
      "environmentOptimal": {"score": 0-100, "rationale": "..."},
      "growthStageAppropriate": {"score": 0-100, "rationale": "..."},
      "rootHealth": {"score": 0-100, "rationale": "..."}
    },
    "likelyCauses": [{"cause": "...", "confidence": 0-100, "evidence": "...", "rationale": "..."}],
    "evidenceObservations": ["obs1"],
    "uncertainties": ["limitation1"],
    "recommendations": {"immediate": ["..."], "shortTerm": ["..."], "longTerm": ["..."]},
    "detectedIssues": [{"type": "...", "name": "...", "severity": "...", "confidence": 0-100, "evidence": "...", "treatment": "..."}],
    "confidence": 0-100,
    "prognosis": "...",
    "followUpSchedule": "..."
  }
}

Return ONLY the JSON object. No markdown wrapping.`;

    const tempUnitInstruction = loadTemperatureUnit() === 'F'
      ? '\n\nTEMPERATURE UNIT: Use Fahrenheit (°F) for ALL temperature references in your diagnosis. Do NOT use Celsius.'
      : '';

    let response;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await executeRequest(provider, {
        prompt,
        image: this.image,
        systemPrompt: AGENT_SYSTEM_PROMPT + tempUnitInstruction,
        temperature: 0.3,
        maxTokens: 8192,
        timeout: 60000,
      });
      if (response.success) break;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (response!.success) {
      const parsed = this.parseAgentResponse(response!.content);
      if (parsed?.diagnosis) {
        try {
          this.session.result = validateAndFillDefaults(parsed.diagnosis);
          this.saveToMemory();
          if (this.session.plan) {
            this.session.plan.status = 'complete';
            this.session.plan.updatedAt = Date.now();
          }
          // Run council review (Agent-Teams QA pattern)
          await this.runCouncilReview();
          this.session.status = 'done';
          this.session.phase = 'done';
        } catch {
          this.session.status = 'error';
          this.addSystemMessage('Could not parse final diagnosis.');
        }
      } else if (parsed?.action === 'diagnose') {
        // Try wrapping the whole response
        try {
          this.session.result = validateAndFillDefaults(parsed as unknown as Partial<PlantAnalysisResult>);
          this.saveToMemory();
          // Run council review (Agent-Teams QA pattern)
          await this.runCouncilReview();
          this.session.status = 'done';
          this.session.phase = 'done';
        } catch {
          this.session.status = 'error';
          this.addSystemMessage('Agent could not produce a valid diagnosis.');
        }
      } else {
        // Last resort: try to find a diagnosis-like object anywhere in the parsed response
        let found = false;
        if (parsed) {
          for (const value of Object.values(parsed)) {
            if (value && typeof value === 'object' && 'diagnosis' in value && 'healthScore' in value) {
              try {
                this.session.result = validateAndFillDefaults(value as Partial<PlantAnalysisResult>);
                this.saveToMemory();
                await this.runCouncilReview();
                this.session.status = 'done';
                this.session.phase = 'done';
                found = true;
                break;
              } catch { /* continue searching */ }
            }
          }
        }
        if (!found) {
          // Try raw JSON extraction from response content as final fallback
          try {
            const rawParsed = JSON.parse(response!.content.trim());
            const candidates = [rawParsed, ...Object.values(rawParsed).filter(v => v && typeof v === 'object')];
            for (const candidate of candidates) {
              if (candidate && typeof candidate === 'object' && 'diagnosis' in candidate && 'healthScore' in candidate) {
                try {
                  this.session.result = validateAndFillDefaults(candidate as Partial<PlantAnalysisResult>);
                  this.saveToMemory();
                  await this.runCouncilReview();
                  this.session.status = 'done';
                  this.session.phase = 'done';
                  found = true;
                  break;
                } catch { /* continue */ }
              }
            }
          } catch { /* not valid JSON */ }
        }
        if (!found) {
          this.session.status = 'error';
          this.addSystemMessage('Agent could not produce a diagnosis. Try adding more details like a photo, symptoms, or growth stage.');
        }
      }
    } else {
      this.session.status = 'error';
      this.addSystemMessage(`Failed to generate diagnosis: ${response!.error}`);
    }
    this.onUpdate({ ...this.session });
  }

  // --- Context Management ---

  private compressContext(): void {
    const toolMessages = this.session.messages.filter((m) => m.role === 'tool');
    const keyFindings: string[] = [];
    const openQuestions: string[] = [];
    const evidenceFor: string[] = [];
    const evidenceAgainst: string[] = [];

    for (const msg of toolMessages) {
      try {
        const data = JSON.parse(msg.content);
        if (data.top_matches) {
          keyFindings.push(`${msg.toolName}: ${data.top_matches.map((m: { issue: string }) => m.issue).join(', ')}`);
        } else if (data.checks) {
          const warnings = data.checks.filter((c: { status: string }) => c.status !== 'optimal');
          if (warnings.length > 0) {
            keyFindings.push(`${msg.toolName}: ${warnings.map((c: { parameter: string; deviation: string }) => `${c.parameter} ${c.deviation}`).join(', ')}`);
          }
        } else if (data.locked_out_nutrients?.length > 0) {
          keyFindings.push(`${msg.toolName}: ${data.locked_out_nutrients.map((n: { nutrient: string }) => n.nutrient).join(', ')} locked out`);
        }
      } catch {
        keyFindings.push(`${msg.toolName}: completed`);
      }
    }

    // Populate evidenceFor/evidenceAgainst from hypothesis tracking
    for (const hyp of this.session.hypotheses) {
      if (hyp.status === 'active' || hyp.status === 'confirmed') {
        evidenceFor.push(...hyp.supportingEvidence.map((e) => `${hyp.label}: ${e}`));
        evidenceAgainst.push(...hyp.contradictingEvidence.map((e) => `${hyp.label}: ${e}`));
      }
    }

    // Derive open questions from gaps
    const activeHyps = this.session.hypotheses.filter((h) => h.status === 'active');
    if (activeHyps.length > 1) {
      openQuestions.push(`Multiple active hypotheses — need to differentiate: ${activeHyps.map((h) => h.label).join(', ')}`);
    }
    if (this.session.evidenceLog.length > 0 && this.session.evidenceLog.length < 2) {
      openQuestions.push('Limited evidence gathered — more tool calls would improve confidence');
    }

    this.session.contextSummary = {
      totalToolCalls: this.session.toolCalls,
      keyFindings,
      openQuestions,
      evidenceFor,
      evidenceAgainst,
      compressedAt: Date.now(),
    };
  }

  private buildContextPrompt(): string {
    let context = '';

    // Temperature unit instruction
    const tempUnit = loadTemperatureUnit();
    if (tempUnit === 'F') {
      context += `\n\nTEMPERATURE UNIT: Use Fahrenheit (°F) for ALL temperature references in your responses, recommendations, and diagnoses. Do NOT use Celsius. Reference ranges: Seedling 68-77°F, Veg 72-82°F, Flower 68-79°F, Late Flower 64-75°F.`;
    } else {
      context += `\n\nTEMPERATURE UNIT: Use Celsius (°C) for all temperature references.`;
    }

    if (this.session.plan) {
      const completed = this.session.plan.tasks.filter((t) => t.status === 'completed').length;
      const total = this.session.plan.tasks.length;
      context += `\n\nPLAN: "${this.session.plan.goal}" (${completed}/${total} tasks done)`;
      const pending = this.session.plan.tasks.filter((t) => t.status === 'pending');
      if (pending.length > 0) {
        context += `\nRemaining tasks: ${pending.map((t) => t.label).join(', ')}`;
      }
    }

    if (this.session.reflections.length > 0) {
      const latest = this.session.reflections[this.session.reflections.length - 1];
      context += `\n\nLATEST REFLECTION (confidence: ${latest.confidence}%):`;
      if (latest.gaps.length > 0) context += `\nGaps: ${latest.gaps.join(', ')}`;
      if (latest.contradictions.length > 0) context += `\nContradictions: ${latest.contradictions.join(', ')}`;
    }

    if (this.session.contextSummary) {
      context += `\n\nCOMPRESSED CONTEXT:`;
      context += `\nKey findings: ${this.session.contextSummary.keyFindings.join('; ')}`;
      if (this.session.contextSummary.evidenceFor.length > 0) {
        context += `\nEvidence for: ${this.session.contextSummary.evidenceFor.join('; ')}`;
      }
      if (this.session.contextSummary.evidenceAgainst.length > 0) {
        context += `\nEvidence against: ${this.session.contextSummary.evidenceAgainst.join('; ')}`;
      }
    }

    // Include evidence tracking summary
    const evidenceSummary = this.buildEvidenceSummary();
    if (evidenceSummary) {
      context += `\n\n${evidenceSummary}`;
    }

    if (this.session.plantMemory.length > 0) {
      context += `\n\nRELEVANT PAST ANALYSES:`;
      for (const entry of this.session.plantMemory.slice(-3)) {
        context += `\n- ${entry.diagnosis} (score: ${entry.healthScore}, ${new Date(entry.timestamp).toLocaleDateString()})`;
      }
    }

    return context;
  }

  // --- Plant Memory ---

  private saveToMemory(): void {
    if (!this.session.result) return;

    try {
      const profiles = loadPlantProfiles();
      const obs = this.session.structuredObservations;
      const getObs = (key: string) => obs.find((o) => o.key === key)?.value;

      const strain = getObs('strain') || this.session.observations.find((o) => o.startsWith('Strain:'))?.replace('Strain: ', '');
      const stage = getObs('growth_stage') || this.session.observations.find((o) => o.startsWith('Growth stage:'))?.replace('Growth stage: ', '');
      const temp = getObs('temperature') || this.session.observations.find((o) => o.startsWith('Temperature:'))?.match(/([\d.]+)/)?.[1];
      const hum = getObs('humidity') || this.session.observations.find((o) => o.startsWith('Humidity:'))?.match(/([\d.]+)/)?.[1];
      const ph = getObs('ph_level') || this.session.observations.find((o) => o.startsWith('pH:'))?.match(/([\d.]+)/)?.[1];

      // Enrich key findings with hypothesis data
      const keyFindings = [
        ...this.session.result.evidenceObservations.slice(0, 3),
        ...this.session.hypotheses
          .filter((h) => h.status === 'confirmed' || (h.status === 'active' && h.confidence >= 60))
          .map((h) => `${h.label} (${h.confidence}% confidence)`),
      ].slice(0, 5);

      const entry: PlantMemoryEntry = {
        id: `mem-${Date.now()}`,
        plantId: `plant-${strain || 'unknown'}`,
        plantName: strain || 'Unknown Plant',
        strain,
        timestamp: Date.now(),
        analysisId: this.session.id,
        healthScore: this.session.result.healthScore,
        diagnosis: this.session.result.diagnosis,
        urgency: this.session.result.urgency,
        keyFindings,
        environment: {
          temperature: temp ? parseFloat(temp) : undefined,
          humidity: hum ? parseFloat(hum) : undefined,
          phLevel: ph ? parseFloat(ph) : undefined,
        },
        growthStage: stage as PlantProfile['entries'][0]['growthStage'],
      };

      let profile = profiles.find(
        (p) => strain && p.strain?.toLowerCase() === strain.toLowerCase()
      );

      if (!profile) {
        profile = {
          id: `profile-${Date.now()}`,
          name: strain || 'Unknown Plant',
          strain,
          createdAt: Date.now(),
          entries: [],
          trend: 'unknown',
        };
        profiles.push(profile);
      }

      profile.entries.push(entry);
      profile.lastAnalysis = Date.now();

      // Calculate trend
      if (profile.entries.length >= 2) {
        const recent = profile.entries.slice(-3);
        const scores = recent.map((e) => e.healthScore);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const latest = scores[scores.length - 1];
        if (latest > avg + 5) profile.trend = 'improving';
        else if (latest < avg - 5) profile.trend = 'declining';
        else profile.trend = 'stable';
      }

      savePlantProfiles(profiles);
    } catch (err) {
      console.warn('Failed to save plant memory:', err);
    }
  }

  // --- Council Review (Agent-Teams pattern) ---

  private async runCouncilReview(): Promise<void> {
    if (!this.session.result) return;

    this.session.status = 'reflecting';
    this.onUpdate({ ...this.session });

    try {
      const review = await councilReviewDiagnosis({
        diagnosis: this.session.result,
        observations: this.session.observations,
        providers: this.providers,
        image: this.image,
        onMessage: (msg) => {
          this.session.messages.push({
            ...msg,
            role: 'system' as const,
          });
          this.onUpdate({ ...this.session });
        },
      });

      this.session.councilReview = review;

      // If council recommends corrections, note them
      if (review.corrections.length > 0 || !review.approved) {
        const reviewMsg: AgentMessage = {
          id: this.nextId('review'),
          role: 'system',
          content: review.approved
            ? `Council Review: Approved (${review.confidence}%). ${review.strengths.length > 0 ? 'Strengths noted: ' + review.strengths.slice(0, 2).join('; ') : ''}`
            : `Council Review: The council flagged concerns (${review.confidence}% agreement). ${review.corrections.slice(0, 2).join('; ')}`,
          timestamp: Date.now(),
        };
        this.session.messages.push(reviewMsg);
      }

      this.onUpdate({ ...this.session });
    } catch (err) {
      // Council review failure is non-fatal — the diagnosis is still valid
      console.warn('Council review failed:', err);
    }
  }

  // --- Evidence & Hypothesis Tracking ---

  private addStructuredObservation(key: string, value: string, source: StructuredObservation['source']): void {
    const existing = this.session.structuredObservations.find((o) => o.key === key);
    if (existing) {
      existing.value = value;
      existing.timestamp = Date.now();
      existing.source = source;
    } else {
      this.session.structuredObservations.push({ key, value, source, timestamp: Date.now() });
    }
  }

  private addHypothesis(label: string, confidence: number, evidence?: string): AgentHypothesis {
    const hypothesis: AgentHypothesis = {
      id: `hyp-${Date.now()}-${this.session.hypotheses.length}`,
      label,
      confidence,
      supportingEvidence: evidence ? [evidence] : [],
      contradictingEvidence: [],
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.session.hypotheses.push(hypothesis);
    if (!this.session.activeHypothesisId) {
      this.session.activeHypothesisId = hypothesis.id;
    }
    return hypothesis;
  }

  private updateHypothesis(id: string, updates: Partial<Pick<AgentHypothesis, 'confidence' | 'status' | 'supportingEvidence' | 'contradictingEvidence'>>): void {
    const hyp = this.session.hypotheses.find((h) => h.id === id);
    if (!hyp) return;
    if (updates.confidence !== undefined) hyp.confidence = updates.confidence;
    if (updates.status !== undefined) hyp.status = updates.status;
    if (updates.supportingEvidence) hyp.supportingEvidence.push(...updates.supportingEvidence);
    if (updates.contradictingEvidence) hyp.contradictingEvidence.push(...updates.contradictingEvidence);
    hyp.updatedAt = Date.now();
  }

  private logToolEvidence(toolName: string, toolResult: string): void {
    let summary = '';
    let keyData: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(toolResult);
      keyData = parsed;

      if (parsed.top_matches) {
        const matches = parsed.top_matches as Array<{ issue: string; matchScore: number }>;
        summary = `Matched: ${matches.slice(0, 3).map((m) => `${m.issue} (${m.matchScore}%)`).join(', ')}`;

        // Auto-create/update hypotheses from symptom matches
        for (const match of matches.slice(0, 2)) {
          const existing = this.session.hypotheses.find((h) => h.label === match.issue && h.status === 'active');
          if (existing) {
            this.updateHypothesis(existing.id, {
              confidence: Math.min(95, Math.max(match.matchScore, existing.confidence)),
              supportingEvidence: [`Symptom match: ${match.matchScore}% confidence`],
            });
          } else if (match.matchScore >= 30) {
            this.addHypothesis(match.issue, match.matchScore, `Symptom match: ${match.matchScore}% confidence`);
          }
        }
      } else if (parsed.checks) {
        const warnings = (parsed.checks as Array<{ parameter: string; status: string; deviation: string }>).filter((c) => c.status !== 'optimal');
        summary = warnings.length > 0
          ? `Issues: ${warnings.map((c) => `${c.parameter} ${c.deviation}`).join(', ')}`
          : 'All parameters optimal';

        // Update active hypothesis with environmental evidence
        if (warnings.length > 0 && this.session.activeHypothesisId) {
          this.updateHypothesis(this.session.activeHypothesisId, {
            supportingEvidence: [`Environment: ${warnings.map((c) => `${c.parameter} ${c.status}`).join(', ')}`],
          });
        }
      } else if (parsed.locked_out_nutrients?.length > 0) {
        summary = `Lockout: ${(parsed.locked_out_nutrients as Array<{ nutrient: string }>).map((n) => n.nutrient).join(', ')}`;

        // Lockout evidence strengthens deficiency hypotheses
        for (const nutrient of parsed.locked_out_nutrients as Array<{ nutrient: string }>) {
          const deficiencyHyp = this.session.hypotheses.find(
            (h) => h.status === 'active' && h.label.toLowerCase().includes(nutrient.nutrient.toLowerCase()) && h.label.toLowerCase().includes('deficiency')
          );
          if (deficiencyHyp) {
            this.updateHypothesis(deficiencyHyp.id, {
              confidence: Math.min(95, deficiencyHyp.confidence + 10),
              supportingEvidence: [`${nutrient.nutrient} locked out at current pH`],
            });
          }
        }
      } else if (parsed.status === 'diagnosis_complete') {
        summary = `Diagnosis: ${parsed.diagnosis}`;
        // Confirm the matching hypothesis
        const matchingHyp = this.session.hypotheses.find(
          (h) => h.status === 'active' && h.label.toLowerCase().includes(String(parsed.diagnosis).toLowerCase().substring(0, 10))
        );
        if (matchingHyp) {
          this.updateHypothesis(matchingHyp.id, { status: 'confirmed' });
        }
      } else if (parsed.status === 'needs_more_info') {
        summary = 'Requesting more information';
      } else if (parsed.found !== undefined) {
        summary = parsed.found ? `Found: ${parsed.matches?.[0]?.name || 'match'}` : 'Not found';
      } else if (parsed.critique_summary) {
        summary = `Critique: ${parsed.critique_summary?.substring(0, 80)}`;

        // Update hypothesis confidence from self-critique
        if (parsed.adjusted_confidence && this.session.activeHypothesisId) {
          this.updateHypothesis(this.session.activeHypothesisId, {
            confidence: parsed.adjusted_confidence as number,
          });
        }
        // Handle ruled-out weaknesses
        if (parsed.weaknesses?.length > 1 && this.session.activeHypothesisId) {
          this.updateHypothesis(this.session.activeHypothesisId, {
            contradictingEvidence: parsed.weaknesses as string[],
          });
        }
      } else if (parsed.vpd !== undefined) {
        summary = `VPD: ${parsed.vpd} kPa (${parsed.status})`;
      } else if (parsed.growth_stage) {
        summary = `Stage info: ${parsed.stage || parsed.growth_stage}`;
      } else {
        summary = toolResult.substring(0, 100);
      }
    } catch {
      summary = toolResult.substring(0, 100);
    }

    this.session.evidenceLog.push({
      toolName,
      timestamp: Date.now(),
      summary,
      keyData,
      supportsHypothesis: this.session.activeHypothesisId,
    });

    // Update active hypothesis with evidence
    if (this.session.activeHypothesisId && toolName !== 'self_critique') {
      this.updateHypothesis(this.session.activeHypothesisId, {
        supportingEvidence: [`${toolName}: ${summary}`],
      });
    }
  }

  private parseObservationsFromUserInput(): void {
    const lastUserMsg = [...this.session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    const text = lastUserMsg.content.toLowerCase();

    // Extract structured data from user text
    const strainMatch = lastUserMsg.content.match(/strain:\s*([^\n,]+)/i);
    if (strainMatch) this.addStructuredObservation('strain', strainMatch[1].trim(), 'user');

    const stageMatch = lastUserMsg.content.match(/(?:growth\s*stage|stage):\s*([^\n,]+)/i);
    if (stageMatch) this.addStructuredObservation('growth_stage', stageMatch[1].trim(), 'user');

    const phMatch = lastUserMsg.content.match(/(?:ph|pH)[:\s]*([\d.]+)/i);
    if (phMatch) this.addStructuredObservation('ph_level', phMatch[1], 'user');

    const tempMatch = lastUserMsg.content.match(/(?:temp(?:erature)?)[:\s]*([\d.]+)/i);
    if (tempMatch) this.addStructuredObservation('temperature', tempMatch[1], 'user');

    const humMatch = lastUserMsg.content.match(/(?:hum(?:idity)?)[:\s]*([\d.]+)/i);
    if (humMatch) this.addStructuredObservation('humidity', humMatch[1], 'user');

    // Track key symptom keywords
    const symptomKeywords = [
      'yellowing', 'brown spots', 'wilting', 'drooping', 'curling',
      'burnt tips', 'mold', 'webbing', 'spots', 'discoloration',
      'stunted', 'stretching', 'purple', 'white powder', 'holes',
    ];
    for (const keyword of symptomKeywords) {
      if (text.includes(keyword)) {
        this.addStructuredObservation(`symptom:${keyword}`, 'present', 'user');
      }
    }

    // Track medium
    if (text.includes('coco')) this.addStructuredObservation('medium', 'coco', 'user');
    else if (text.includes('hydro') || text.includes('dwc')) this.addStructuredObservation('medium', 'hydro', 'user');
    else if (text.includes('soil')) this.addStructuredObservation('medium', 'soil', 'user');
  }

  private buildEvidenceSummary(): string {
    const lines: string[] = [];

    // Structured observations
    if (this.session.structuredObservations.length > 0) {
      lines.push('STRUCTURED OBSERVATIONS:');
      for (const obs of this.session.structuredObservations) {
        lines.push(`  ${obs.key}: ${obs.value} [${obs.source}]`);
      }
    }

    // Hypotheses
    const activeHyps = this.session.hypotheses.filter((h) => h.status === 'active');
    if (activeHyps.length > 0) {
      lines.push('');
      lines.push('ACTIVE HYPOTHESES:');
      for (const hyp of activeHyps.sort((a, b) => b.confidence - a.confidence)) {
        lines.push(`  [${hyp.confidence}%] ${hyp.label}`);
        if (hyp.supportingEvidence.length > 0) {
          lines.push(`    For: ${hyp.supportingEvidence.slice(-3).join('; ')}`);
        }
        if (hyp.contradictingEvidence.length > 0) {
          lines.push(`    Against: ${hyp.contradictingEvidence.join('; ')}`);
        }
      }
    }

    const confirmedHyps = this.session.hypotheses.filter((h) => h.status === 'confirmed');
    if (confirmedHyps.length > 0) {
      lines.push('');
      lines.push('CONFIRMED:');
      for (const hyp of confirmedHyps) {
        lines.push(`  ${hyp.label} — ${hyp.supportingEvidence.slice(-2).join('; ')}`);
      }
    }

    // Evidence log
    if (this.session.evidenceLog.length > 0) {
      lines.push('');
      lines.push('EVIDENCE GATHERED:');
      for (const ev of this.session.evidenceLog) {
        lines.push(`  ${ev.toolName}: ${ev.summary}`);
      }
    }

    return lines.join('\n');
  }

  // --- Helpers ---

  private getProvider(): ProviderConfig | null {
    const active = this.providers.filter((p) => p.textModel || p.visionModel);
    if (active.length === 0) {
      this.session.status = 'error';
      this.addSystemMessage('No AI providers configured. Please add a provider in Settings.');
      this.onUpdate({ ...this.session });
      return null;
    }
    return active.find((p) => p.isDefault) || active[0];
  }

  private buildLLMMessages(): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of this.session.messages) {
      if (msg.role === 'agent') {
        const content = msg.thinking
          ? `THINKING: ${msg.thinking}\n\nMESSAGE: ${msg.content}`
          : msg.content;
        if (content) messages.push({ role: 'assistant', content });
      } else if (msg.role === 'user') {
        const userContent = msg.imageData
          ? `${msg.content}\n[Photo attached — analyze visual symptoms]`
          : msg.content;
        messages.push({ role: 'user', content: userContent });
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'user',
          content: `[Tool Result — ${msg.toolName}]:\n${msg.content}`,
        });
      } else if (msg.role === 'system') {
        messages.push({ role: 'user', content: `[System]: ${msg.content}` });
      } else if (msg.role === 'plan') {
        messages.push({ role: 'assistant', content: `[Plan created]: ${msg.content}` });
      } else if (msg.role === 'reflection') {
        messages.push({
          role: 'assistant',
          content: `[Self-reflection]: ${msg.content}${msg.thinking ? `\nReasoning: ${msg.thinking}` : ''}`,
        });
      }
    }

    return messages;
  }

  private parseAgentResponse(content: string): ParsedAgentResponse | null {
    try {
      const trimmed = content.trim();

      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed) as ParsedAgentResponse;
      }

      const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim()) as ParsedAgentResponse;
      }

      const startIdx = trimmed.indexOf('{');
      if (startIdx !== -1) {
        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < trimmed.length; i++) {
          if (trimmed[i] === '{') depth++;
          if (trimmed[i] === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }
        if (endIdx !== -1) {
          return JSON.parse(trimmed.substring(startIdx, endIdx)) as ParsedAgentResponse;
        }
      }

      // No JSON found — return as conversational message so the loop can continue
      return { message_to_user: content };
    } catch {
      // JSON parse failed — try to salvage any text content as a message
      // so the agent loop can continue instead of failing
      const textContent = content.replace(/```json\s*|\s*```/g, '').trim();
      if (textContent.length > 0) {
        return { message_to_user: textContent };
      }
      return null;
    }
  }

  private messageCounter = 0;

  private nextId(prefix: string): string {
    return `${prefix}-${Date.now()}-${++this.messageCounter}`;
  }

  private addAgentMessage(content: string): void {
    this.session.messages.push({
      id: this.nextId('msg'),
      role: 'agent',
      content,
      timestamp: Date.now(),
    });
  }

  private addSystemMessage(content: string, internal = false): void {
    this.session.messages.push({
      id: this.nextId('sys'),
      role: 'system',
      content,
      timestamp: Date.now(),
      internal,
    });
  }

  private ensureTerminalStatus(): void {
    if (
      this.session.status !== 'done' &&
      this.session.status !== 'error' &&
      this.session.status !== 'asking_user'
    ) {
      this.session.status = 'error';
      this.addSystemMessage('The agent encountered an unexpected issue and could not complete. Please try again.');
      this.onUpdate({ ...this.session });
    }
  }
}
