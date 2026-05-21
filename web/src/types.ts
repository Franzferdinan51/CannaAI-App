// ============================================
// CannaAI Web - Type Definitions
// ============================================

// --- AI Provider Types ---

export type ProviderType = 'lmstudio' | 'openrouter' | 'nvidia-nim' | 'openai-compatible';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string;
  isDefault: boolean;
}

export interface AIRequest {
  prompt: string;
  image?: string; // base64 or data URL
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  useVision?: boolean;
  responseFormat?: 'json';
  timeout?: number; // request timeout in ms (default: 120000)
}

export interface AIResponse {
  success: boolean;
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
}

// --- Plant Analysis Types ---

export interface AnalysisParams {
  image?: string;
  strain?: string;
  growthStage?: GrowthStage;
  medium?: string;
  symptoms?: string[];
  phLevel?: number;
  temperature?: number;
  humidity?: number;
  leafSymptoms?: string[];
  notes?: string;
}

export type GrowthStage =
  | 'seedling'
  | 'vegetative'
  | 'pre-flower'
  | 'flowering'
  | 'late-flower'
  | 'harvest-ready'
  | 'drying'
  | 'curing';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HealthScoreBreakdown {
  vigor: ScoreEntry;
  leafCondition: ScoreEntry;
  pestFree: ScoreEntry;
  environmentOptimal: ScoreEntry;
  growthStageAppropriate: ScoreEntry;
  rootHealth: ScoreEntry;
}

export interface ScoreEntry {
  score: number;
  rationale: string;
}

export interface LikelyCause {
  cause: string;
  confidence: number;
  evidence: string;
  rationale: string;
}

export interface DetectedIssue {
  type: 'pest' | 'disease' | 'deficiency' | 'toxicity' | 'stress' | 'environmental';
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  evidence: string;
  treatment: string;
}

export interface RecommendationGroup {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
}

export interface PlantAnalysisResult {
  diagnosis: string;
  summary: string;
  urgency: UrgencyLevel;
  urgencyReasons: string[];
  healthScore: number;
  healthScoreBreakdown: HealthScoreBreakdown;
  likelyCauses: LikelyCause[];
  evidenceObservations: string[];
  uncertainties: string[];
  recommendations: RecommendationGroup;
  detectedIssues: DetectedIssue[];
  confidence: number;
  prognosis: string;
  followUpSchedule: string;
}

export interface AnalysisReport {
  id: string;
  timestamp: number;
  params: AnalysisParams;
  result: PlantAnalysisResult;
  provider: string;
  model: string;
  councilUsed: boolean;
  councilVotes?: CouncilVoteResult;
}

// --- AI Council Types ---

export type SessionMode =
  | 'deliberation'
  | 'advisory'
  | 'consensus'
  | 'adversarial'
  | 'brainstorm'
  | 'risk-assessment'
  | 'peer-review'
  | 'swarm'
  | 'socratic'
  | 'emergency'
  | 'proposal'
  | 'vision'
  | 'strategic'
  | 'multi-model';

export type DebateRound = 'opening' | 'rebuttal' | 'closing';

export type PersonaGroup = 'leadership' | 'security' | 'technical' | 'strategy' | 'domain' | 'analysts' | 'special';

export interface CouncilPersona {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  expertise: string[];
  systemPrompt: string;
  personality: string;
  voteWeight?: number;
  group?: PersonaGroup;
  vetoTopics?: string[];
}

export interface CouncilMessage {
  id: string;
  personaId: string;
  personaName: string;
  personaEmoji: string;
  content: string;
  timestamp: number;
  vote?: 'agree' | 'disagree' | 'abstain';
  reasoning?: string;
  round?: DebateRound;
  respondsTo?: string;
  confidence?: number;
}

export interface CouncilVoteResult {
  agree: number;
  disagree: number;
  abstain: number;
  consensus: string;
  dissenting: string[];
  synthesis: string;
  decree?: CouncilDecree;
}

export interface CouncilDecree {
  id: string;
  title: string;
  mandates: string[];
  prohibitions: string[];
  recommendations: string[];
  enforcementLevel: 'advisory' | 'recommended' | 'binding';
  dissentingViews: string[];
  confidenceScore: number;
}

export interface GroupDeliberationResult {
  group: PersonaGroup;
  groupName: string;
  personas: string[];
  summary: string;
  vote: 'agree' | 'disagree' | 'abstain';
  confidence: number;
  keyPoints: string[];
}

export interface MultiModelResult {
  groupResults: GroupDeliberationResult[];
  synthesis: string;
  consensus: number;
  decree?: CouncilDecree;
}

export interface CouncilTeamTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  personaIds: string[];
  bestFor: string[];
  defaultMode: SessionMode;
}

export interface CouncilSession {
  id: string;
  topic: string;
  mode: SessionMode;
  messages: CouncilMessage[];
  votes?: CouncilVoteResult;
  timestamp: number;
  selectedPersonas: string[];
  round?: DebateRound;
  teamTemplate?: string;
  multiModelResult?: MultiModelResult;
}

// --- Strain Library Types ---

export interface Strain {
  id: string;
  name: string;
  type: 'indica' | 'sativa' | 'hybrid' | 'ruderalis' | 'hemp';
  thc: string;
  cbd: string;
  floweringTime: string;
  yield: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  effects: string[];
  flavors: string[];
  medicalUses: string[];
  description: string;
  growTips: string[];
}

// --- Web Search (Plant Doctor) ---

export type WebSearchProvider = 'brave' | 'tavily' | 'searxng';

export interface WebSearchConfig {
  enabled: boolean;
  provider: WebSearchProvider;
  braveApiKey: string;
  tavilyApiKey: string;
  searxngUrl: string;
  maxResults: number;
}

// --- Navigation ---

export type Page = 'dashboard' | 'analysis' | 'chat' | 'agent' | 'council' | 'strains' | 'settings';

// ============================================
// Agent Framework Types
// ============================================

export type AgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface AgentTask {
  id: string;
  label: string;
  description: string;
  status: AgentTaskStatus;
  toolName?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentPlan {
  id: string;
  goal: string;
  tasks: AgentTask[];
  createdAt: number;
  updatedAt: number;
  status: 'planning' | 'executing' | 'reflecting' | 'complete';
}

export interface AgentReflection {
  id: string;
  stage: 'pre_diagnosis' | 'post_diagnosis' | 'final';
  confidence: number;
  gaps: string[];
  contradictions: string[];
  needsMoreInfo: boolean;
  suggestedNextAction: string;
  reasoning: string;
  timestamp: number;
}

export interface PlantMemoryEntry {
  id: string;
  plantId: string;
  plantName: string;
  strain?: string;
  timestamp: number;
  analysisId: string;
  healthScore: number;
  diagnosis: string;
  urgency: UrgencyLevel;
  keyFindings: string[];
  environment?: {
    temperature?: number;
    humidity?: number;
    phLevel?: number;
  };
  growthStage?: GrowthStage;
  image?: string; // thumbnail
}

export interface PlantProfile {
  id: string;
  name: string;
  strain?: string;
  medium?: string;
  createdAt: number;
  entries: PlantMemoryEntry[];
  lastAnalysis?: number;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
}

export interface AgentContextSummary {
  totalToolCalls: number;
  keyFindings: string[];
  openQuestions: string[];
  evidenceFor: string[];
  evidenceAgainst: string[];
  compressedAt: number;
}

export interface AgentHypothesis {
  id: string;
  label: string;
  confidence: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: 'active' | 'confirmed' | 'ruled_out' | 'superseded';
  createdAt: number;
  updatedAt: number;
}

export interface StructuredObservation {
  key: string;
  value: string;
  source: 'user' | 'tool' | 'image' | 'inference';
  timestamp: number;
}

export interface ToolEvidence {
  toolName: string;
  timestamp: number;
  summary: string;
  keyData: Record<string, unknown>;
  supportsHypothesis?: string;
}
