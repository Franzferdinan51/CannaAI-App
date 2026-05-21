import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProviderConfig, GrowthStage } from '../types';
import { executeRequestStream } from '../services/ai-providers';
import { getTool, getToolDescriptions } from '../services/agent-tools';
import { performWebSearch, type SearchResult } from '../services/web-search';
import { MarkdownContent, CopyButton } from './MarkdownContent';
import { GROWTH_STAGES } from '../constants';
import { loadJSON, saveJSON } from '../utils/storage';

interface Props {
  providers: ProviderConfig[];
}

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

type ChatMode = 'general' | 'diagnosis' | 'analysis' | 'nutrients' | 'environment';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  image?: string;
  timestamp: string;
  mode?: ChatMode;
}

interface PlantContext {
  strain: string;
  growthStage: GrowthStage | '';
  medium: string;
  ph: string;
  temp: string;
  humidity: string;
  lightHours: string;
}

interface ChatParams {
  temperature: number;
  maxTokens: number;
}

interface PromptTemplate {
  id: string;
  name: string;
  icon: string;
  mode: ChatMode;
  prompt: string;
}

const STORAGE_KEY_MESSAGES = 'cannaai_chat_messages';
const STORAGE_KEY_HISTORY = 'cannaai_chat_history';
const STORAGE_KEY_CONTEXT = 'cannaai_chat_context';
const STORAGE_KEY_PARAMS = 'cannaai_chat_params';

const PROMPT_TEMPLATES: PromptTemplate[] = [
  { id: 'yellow-diag', name: 'Yellow Leaves Diagnosis', icon: '\u{1F342}', mode: 'diagnosis', prompt: 'My plant has yellowing leaves starting from the bottom. The leaves are curling downward and some have brown spots. What could be causing this?' },
  { id: 'nute-sched', name: 'Flowering Feed Schedule', icon: '\u{1F4C5}', mode: 'nutrients', prompt: 'Generate a week-by-week nutrient feeding schedule for the flowering stage in coco coir. Include N-P-K ratios, EC targets, and supplement recommendations.' },
  { id: 'vpd-calc', name: 'VPD Calculator', icon: '\u{1F321}\u{FE0F}', mode: 'environment', prompt: 'My grow room is at 26\u00B0C and 55% humidity during the flowering stage. Calculate my VPD and tell me if I need to adjust anything.' },
  { id: 'pest-id', name: 'Pest Identification', icon: '\u{1F41B}', mode: 'diagnosis', prompt: "I found tiny white flying insects on the underside of my leaves and there's a sticky residue on the leaves. What pest is this and how do I treat it?" },
  { id: 'bud-rot', name: 'Bud Rot Check', icon: '\u{1F50D}', mode: 'diagnosis', prompt: 'Some of my buds are turning brown and mushy on the inside while the outside looks fine. I also see some grey fuzz. Is this bud rot? What should I do?' },
  { id: 'yield-boost', name: 'Yield Optimization', icon: '\u{1F4C8}', mode: 'analysis', prompt: "I'm in week 3 of flowering with a SCROG setup. What techniques can I still use to maximize my yield? Include defoliation, feeding, and environmental adjustments." },
  { id: 'ph-lockout', name: 'pH Lockout Guide', icon: '\u{2697}\u{FE0F}', mode: 'nutrients', prompt: 'I suspect nutrient lockout due to pH issues. My runoff pH is 5.2 in coco. Walk me through diagnosing which nutrients are locked out and how to fix it.' },
  { id: 'light-burn', name: 'Light Stress Assessment', icon: '\u{1F4A1}', mode: 'environment', prompt: 'The top leaves of my plant are bleaching white and the leaf tips are burnt. My light is 12 inches from the canopy. Is this light burn? What distance and intensity should I use?' },
  { id: 'harvest-timing', name: 'Harvest Timing', icon: '\u2702\u{FE0F}', mode: 'analysis', prompt: 'My plant is in late flower. Most pistils have turned brown/amber and I see a mix of cloudy and some amber trichomes. Is it ready to harvest? What should the ideal trichome ratio be?' },
  { id: 'flush-guide', name: 'Pre-Harvest Flush', icon: '\u{1F4A7}', mode: 'nutrients', prompt: "I'm planning to harvest in 2 weeks. Walk me through the flushing process for synthetic nutrients in coco. How long, what pH, and how do I know it's working?" },
];

const MODES: { value: ChatMode; label: string; icon: string; systemPrompt: string }[] = [
  {
    value: 'general',
    label: 'General Chat',
    icon: '\u{1F4AC}',
    systemPrompt: 'You are CannaAI, an expert cannabis and hemp cultivation specialist. Provide helpful, accurate advice about growing cannabis and hemp. Be concise but thorough. Format your responses using markdown: use **bold** for emphasis, bullet lists for steps, headers for sections, and code blocks for measurements or formulas.',
  },
  {
    value: 'diagnosis',
    label: 'Plant Diagnosis',
    icon: '\u{1F52C}',
    systemPrompt: 'You are CannaAI Plant Doctor, a diagnostic specialist. Analyze symptoms, identify issues, and provide treatment plans. Ask clarifying questions if needed. Be systematic and evidence-based. Use markdown formatting: headers for sections, bullet lists for symptoms/treatments, bold for key findings.',
  },
  {
    value: 'analysis',
    label: 'Growth Analysis',
    icon: '\u{1F4CA}',
    systemPrompt: 'You are CannaAI Growth Analyst. Analyze plant growth patterns, identify optimization opportunities, and suggest improvements for yield and quality. Use markdown formatting with headers, lists, and bold text for recommendations.',
  },
  {
    value: 'nutrients',
    label: 'Nutrient Expert',
    icon: '\u{1F9EA}',
    systemPrompt: 'You are CannaAI Nutrient Specialist. Expert in cannabis nutrition, feeding schedules, nutrient lockout, deficiencies, and organic/synthetic nutrients. Provide precise dosing recommendations. Use markdown tables for schedules, lists for symptoms, and code blocks for measurements.',
  },
  {
    value: 'environment',
    label: 'Environment',
    icon: '\u{1F321}\u{FE0F}',
    systemPrompt: 'You are CannaAI Environment Specialist. Expert in grow room environmental control - VPD, lighting, temperature, humidity, CO2, airflow. Optimize growing conditions for maximum yield. Use markdown formatting with tables for ranges and bullet lists for action items.',
  },
];

const QUICK_ACTIONS: { label: string; prompt: string; mode: ChatMode; icon: string }[] = [
  { label: 'Yellow leaves help', prompt: 'My plant has yellowing leaves. What could be causing this and how do I fix it?', mode: 'diagnosis', icon: '\u{1F342}' },
  { label: 'Nutrient schedule', prompt: 'What nutrient schedule do you recommend for the flowering stage?', mode: 'nutrients', icon: '\u{1F4C5}' },
  { label: 'VPD check', prompt: 'What is the ideal VPD for my grow stage and how do I calculate it?', mode: 'environment', icon: '\u{1F321}\u{FE0F}' },
  { label: 'Increase yield', prompt: 'What techniques can I use to increase my yield?', mode: 'analysis', icon: '\u{1F4C8}' },
  { label: 'pH problems', prompt: 'I think I have pH problems. What symptoms should I look for and how do I fix it?', mode: 'nutrients', icon: '\u{2697}\u{FE0F}' },
  { label: 'Light burn?', prompt: 'How can I tell if my plant has light burn and what distance should my light be?', mode: 'environment', icon: '\u{1F4A1}' },
];

function buildToolEnabledPrompt(modePrompt: string): string {
  return `${modePrompt}

You have access to diagnostic tools. When a user asks about symptoms, deficiencies, pests, diseases, environment, nutrients, or strain info, USE the appropriate tool to get accurate data before responding.

To use a tool, respond with ONLY a JSON object:
{"action":"tool_call","tool_name":"tool_name","tool_args":{"param":"value"},"message_to_user":"Brief explanation"}

If you don't need a tool, respond normally with plain text -- NOT JSON. Never respond with JSON unless you are calling a tool. If you need more information from the user, just ask them in plain conversational text.

Available tools:
${getToolDescriptions()}`;
}

// --- Streaming chat with tool loop ---
async function runChatWithToolsStream(
  provider: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  image: string | undefined,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  params?: ChatParams
): Promise<string> {
  const toolMessages: Array<{ role: string; content: string }> = [];
  let toolCallsUsed = 0;
  const maxToolCalls = 3;

  let prompt = userMessage;
  let img = image;
  const temp = params?.temperature ?? 0.5;
  const maxTok = params?.maxTokens ?? 2048;

  while (toolCallsUsed <= maxToolCalls) {
    if (signal?.aborted) throw new Error('Aborted');

    // Only stream on the final call (no tool pending)
    const isFinalCall = toolCallsUsed > 0 || toolMessages.length > 0;

    const response = await executeRequestStream(
      provider,
      { prompt, image: img, systemPrompt, temperature: temp, maxTokens: maxTok },
      (chunk) => {
        if (isFinalCall) onChunk(chunk);
      },
      signal
    );

    if (!response.success) throw new Error(response.error || 'Request failed');
    img = undefined;

    const trimmed = response.content.trim();
    let parsed: { action?: string; tool_name?: string; tool_args?: Record<string, unknown>; message_to_user?: string; reason?: string; thinking?: string } | null = null;

    try {
      if (trimmed.startsWith('{')) {
        parsed = JSON.parse(trimmed);
      } else {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Not JSON -- treat as final response
    }

    if (parsed?.action === 'tool_call' && parsed.tool_name) {
      const tool = getTool(parsed.tool_name);
      if (tool) {
        try {
          const toolResult = await tool.execute(parsed.tool_args || {});
          toolCallsUsed++;
          toolMessages.push(
            { role: 'assistant', content: response.content },
            { role: 'user', content: `[Tool Result -- ${parsed.tool_name}]:\n${toolResult}` }
          );
          prompt = toolMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
          continue;
        } catch {
          // Tool failed -- fall through
        }
      }
    }

    // Extract human-readable text from JSON responses
    if (parsed?.action && parsed.action !== 'tool_call') {
      const text = parsed.message_to_user || parsed.reason || parsed.thinking;
      if (text && text.trim()) return text;
      prompt = toolMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n') +
        '\n\n[system]: Your last response was JSON metadata. Please provide your answer as natural language text, not JSON.';
      continue;
    }

    return response.content;
  }

  // Max tool calls -- final answer
  const finalMessages = toolMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
  const finalResponse = await executeRequestStream(
    provider,
    {
      prompt: finalMessages + '\n\n[assistant]: Based on the tool results above, provide your final answer to the user.',
      systemPrompt,
      temperature: temp,
      maxTokens: maxTok,
    },
    (chunk) => { onChunk(chunk); },
    signal
  );
  return finalResponse.success ? finalResponse.content : 'I had trouble generating a response. Please try again.';
}


export function Chat({ providers }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => loadJSON(STORAGE_KEY_MESSAGES, []));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [showContext, setShowContext] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; messages: Message[]; timestamp: string }[]>(
    () => loadJSON(STORAGE_KEY_HISTORY, [])
  );
  const [plantContext, setPlantContext] = useState<PlantContext>(
    () => loadJSON(STORAGE_KEY_CONTEXT, { strain: '', growthStage: '', medium: '', ph: '', temp: '', humidity: '', lightHours: '' })
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [params, setParams] = useState<ChatParams>(
    () => loadJSON(STORAGE_KEY_PARAMS, { temperature: 0.5, maxTokens: 2048 })
  );
  const [showParams, setShowParams] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [webSearchResults, setWebSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  // Persist messages
  useEffect(() => { saveJSON(STORAGE_KEY_MESSAGES, messages); }, [messages]);
  useEffect(() => { saveJSON(STORAGE_KEY_HISTORY, chatHistory); }, [chatHistory]);
  useEffect(() => { saveJSON(STORAGE_KEY_CONTEXT, plantContext); }, [plantContext]);
  useEffect(() => { saveJSON(STORAGE_KEY_PARAMS, params); }, [params]);

  // Smart auto-scroll: only scroll if user hasn't scrolled up
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Track if user has scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 100;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    }
  }, [input]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowHistory((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowTemplates((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setShowHistory(false);
        setShowTemplates(false);
        setShowParams(false);
        setWebSearchResults(null);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const activeProvider = providers.find((p) => p.isDefault && p.textModel) ||
    providers.find((p) => p.textModel);

  const currentMode = MODES.find((m) => m.value === chatMode) || MODES[0];

  const buildSystemPrompt = useCallback(() => {
    let prompt = currentMode.systemPrompt;
    if (plantContext.strain || plantContext.growthStage) {
      prompt += '\n\nPlant Context:';
      if (plantContext.strain) prompt += `\n- Strain: ${plantContext.strain}`;
      if (plantContext.growthStage) prompt += `\n- Growth Stage: ${plantContext.growthStage}`;
      if (plantContext.medium) prompt += `\n- Medium: ${plantContext.medium}`;
      if (plantContext.ph) prompt += `\n- pH: ${plantContext.ph}`;
      if (plantContext.temp) prompt += `\n- Temperature: ${plantContext.temp}\u00B0C`;
      if (plantContext.humidity) prompt += `\n- Humidity: ${plantContext.humidity}%`;
      if (plantContext.lightHours) prompt += `\n- Light Hours: ${plantContext.lightHours}`;
    }
    return prompt;
  }, [currentMode, plantContext]);

  // Inline web search (# command)
  const handleWebSearch = async (query: string) => {
    setIsSearchingWeb(true);
    setWebSearchQuery(query);
    try {
      const results = await performWebSearch(query);
      setWebSearchResults(results);
    } catch {
      setWebSearchResults([{ title: 'Search failed', url: '', snippet: 'Could not complete web search.' }]);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  // Export chat as markdown
  const exportChat = () => {
    if (messages.length === 0) return;
    const lines = messages.map((m) => {
      const role = m.role === 'user' ? '**You**' : '**CannaAI**';
      const time = new Date(m.timestamp).toLocaleString();
      const mode = m.mode && m.mode !== 'general' ? ` _(${MODES.find((mo) => mo.value === m.mode)?.label})_` : '';
      return `### ${role}${mode} - ${time}\n\n${m.content}\n`;
    });
    const md = `# CannaAI Chat Export\n\n_${new Date().toLocaleString()}_\n\n---\n\n${lines.join('\n---\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cannaai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendMessage = async (text?: string, mode?: ChatMode, image?: string, webContext?: string) => {
    const msgText = text || input.trim() || (imagePreview ? 'Please analyze this image.' : '');
    const img = image || imagePreview || undefined;
    if (!msgText || isLoading || !activeProvider) return;

    // Append web search context if available
    let fullMsg = msgText;
    if (webContext) {
      fullMsg = `${msgText}\n\n[Web Search Results]:\n${webContext}`;
    } else if (webSearchResults && webSearchResults.length > 0) {
      const searchContext = webSearchResults
        .filter((r) => r.url)
        .map((r) => `- ${r.title}: ${r.snippet}`)
        .join('\n');
      if (searchContext) {
        fullMsg = `${msgText}\n\n[Web Search Results]:\n${searchContext}`;
      }
    }

    if (mode && mode !== chatMode) setChatMode(mode);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msgText,
      image: img || undefined,
      timestamp: new Date().toISOString(),
      mode: mode || chatMode,
    };

    const assistantId = (Date.now() + 1).toString();
    const placeholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      mode: mode || chatMode,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput('');
    setImagePreview(null);
    setIsLoading(true);
    setStreamingContent('');
    setWebSearchResults(null);
    isUserScrolledUp.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = buildToolEnabledPrompt(buildSystemPrompt());
      const result = await runChatWithToolsStream(
        activeProvider,
        systemPrompt,
        fullMsg,
        img,
        (chunk) => setStreamingContent(chunk),
        controller.signal,
        params
      );

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: result } : m)
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const regenerateMessage = async (msgId: string) => {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 1) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;

    const userMsg = messages[userIdx];
    setMessages((prev) => prev.slice(0, idx));
    await sendMessage(userMsg.content, userMsg.mode, userMsg.image);
  };

  const startEditMessage = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    setEditingMsgId(msgId);
    setEditText(msg.content);
  };

  const saveEditMessage = async () => {
    if (!editingMsgId) return;
    const idx = messages.findIndex((m) => m.id === editingMsgId);
    if (idx === -1) return;

    setMessages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], content: editText };
      return updated.slice(0, idx + 1);
    });
    setEditingMsgId(null);
    setEditText('');

    if (messages[idx].role === 'user') {
      const editedMsg = messages[idx];
      await sendMessage(editText, editedMsg.mode, editedMsg.image);
    }
  };

  const deleteMessage = (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        setImagePreview(await normalizeImageToJpeg(dataUrl));
      } catch {
        setImagePreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          setImagePreview(await normalizeImageToJpeg(dataUrl));
        } catch {
          setImagePreview(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const clearChat = () => {
    if (messages.length > 0) {
      const title = messages.find((m) => m.role === 'user')?.content.substring(0, 50) || 'Chat';
      setChatHistory((prev) => [
        { id: Date.now().toString(), title, messages: [...messages], timestamp: new Date().toISOString() },
        ...prev.slice(0, 19),
      ]);
    }
    setMessages([]);
  };

  const loadHistory = (history: { id: string; messages: Message[] }) => {
    setMessages(history.messages);
    setShowHistory(false);
  };

  const deleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const toggleThinking = (id: string) => {
    setShowThinking((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Check for #web search command
      if (input.startsWith('#') && input.length > 1) {
        handleWebSearch(input.slice(1).trim());
        return;
      }
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    isUserScrolledUp.current = false;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filtered history for search
  const filteredHistory = historySearch
    ? chatHistory.filter((h) =>
        h.title.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.messages.some((m) => m.content.toLowerCase().includes(historySearch.toLowerCase()))
      )
    : chatHistory;

  if (!activeProvider) {
    return (
      <div className="page">
        <div className="page-header">
          <h2>Chat</h2>
          <p>AI-powered cannabis cultivation assistant</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u{1F4AC}'}</div>
          <h3 style={{ marginBottom: 8 }}>No Provider Configured</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            Configure a provider with a text model in Settings to start chatting.
          </p>
        </div>
      </div>
    );
  }

  const getDisplayContent = (msg: Message) => {
    if (isLoading && streamingContent && msg.content === '' && msg.id === messages[messages.length - 1]?.id) {
      return streamingContent;
    }
    return msg.content;
  };

  return (
    <div className="page" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Chat</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {activeProvider.name} {'\u00B7'} {activeProvider.textModel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplates(!showTemplates)} title="Prompt Templates (Ctrl+/)">
            {'\u{1F4DD}'} Templates
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(!showHistory)} title="Chat History (Ctrl+K)">
            {'\u{1F4DC}'} History ({chatHistory.length})
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowParams(!showParams)} title="Model Parameters">
            {'\u2699\u{FE0F}'} Params
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowContext(!showContext)}>
            {showContext ? 'Hide' : 'Show'} Context
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportChat} title="Export as Markdown" disabled={messages.length === 0}>
            {'\u{1F4E5}'} Export
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearChat}>
            Clear
          </button>
        </div>
      </div>

      {/* Parameters Panel */}
      {showParams && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Temperature: {params.temperature.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={params.temperature}
                onChange={(e) => setParams((p) => ({ ...p, temperature: parseFloat(e.target.value) }))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {params.temperature <= 0.3 ? 'Precise' : params.temperature <= 0.7 ? 'Balanced' : 'Creative'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Max Tokens: {params.maxTokens}
              </label>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                value={params.maxTokens}
                onChange={(e) => setParams((p) => ({ ...p, maxTokens: parseInt(e.target.value) }))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setParams({ temperature: 0.5, maxTokens: 2048 })}
              style={{ fontSize: 11 }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Templates Panel */}
      {showTemplates && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="card-title" style={{ fontSize: 14 }}>{'\u{1F4DD}'} Prompt Templates</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {MODES.map((m) => (
                <button
                  key={m.value}
                  className={`btn btn-sm ${chatMode === m.value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setChatMode(m.value)}
                  style={{ fontSize: 10, padding: '2px 8px' }}
                >
                  {m.icon}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
            {PROMPT_TEMPLATES.filter((t) => t.mode === chatMode).map((t) => (
              <button
                key={t.id}
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  sendMessage(t.prompt, t.mode);
                  setShowTemplates(false);
                }}
                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '8px 12px', gap: 8, fontSize: 12 }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              </button>
            ))}
            {PROMPT_TEMPLATES.filter((t) => t.mode === chatMode).length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-dim)', gridColumn: '1 / -1' }}>
                No templates for this mode. Switch modes to see templates.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: showContext ? '1fr 280px' : '1fr', gap: 16 }}>
        {/* Main Chat Area */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', position: 'relative' }}>
          {/* Drag overlay */}
          {dragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(76, 175, 80, 0.1)', border: '2px dashed var(--accent)',
              borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>Drop image to upload</div>
            </div>
          )}

          {/* Mode Selector */}
          <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            {MODES.map((mode) => (
              <button
                key={mode.value}
                className={`btn btn-sm ${chatMode === mode.value ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChatMode(mode.value)}
                style={{ whiteSpace: 'nowrap' }}
              >
                {mode.icon} {mode.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>{'\u{1F33F}'}</div>
                <h3 style={{ marginBottom: 8, color: 'var(--text-primary)', fontSize: 22, fontWeight: 700 }}>CannaAI Assistant</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: 16, maxWidth: 460, margin: '0 auto 16px', lineHeight: 1.6 }}>
                  Ask anything about cannabis cultivation. Upload plant photos for instant diagnosis. Type <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>#query</code> to search the web.
                </p>

                {/* Quick Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, maxWidth: 660, margin: '0 auto 24px' }}>
                  {QUICK_ACTIONS.map((action, i) => (
                    <button
                      key={i}
                      className="btn btn-secondary"
                      onClick={() => sendMessage(action.prompt, action.mode)}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px', gap: 10 }}
                    >
                      <span style={{ fontSize: 20 }}>{action.icon}</span>
                      <span style={{ fontSize: 13 }}>{action.label}</span>
                    </button>
                  ))}
                </div>

                {/* Prompt Templates (compact) */}
                <div style={{ maxWidth: 660, margin: '0 auto' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {'\u{1F4DD}'} Prompt Templates
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                    {PROMPT_TEMPLATES.filter((t) => t.mode === chatMode).slice(0, 4).map((t) => (
                      <button
                        key={t.id}
                        className="btn btn-ghost"
                        onClick={() => sendMessage(t.prompt, t.mode)}
                        style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '8px 12px', gap: 8, fontSize: 12, border: '1px solid var(--border)' }}
                      >
                        <span>{t.icon}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      </button>
                    ))}
                  </div>
                  {PROMPT_TEMPLATES.filter((t) => t.mode === chatMode).length > 4 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowTemplates(true)}
                      style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}
                    >
                      View all templates {'\u2192'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const displayContent = getDisplayContent(msg);
              const isStreamingThis = isLoading && streamingContent && msg.content === '' && msg.id === messages[messages.length - 1]?.id;

              return (
                <div
                  key={msg.id}
                  className="chat-msg-row"
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                    {/* Mode badge */}
                    {msg.mode && msg.mode !== 'general' && (
                      <div style={{
                        fontSize: 10,
                        color: 'var(--text-dim)',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        {MODES.find((m) => m.value === msg.mode)?.icon}
                        {MODES.find((m) => m.value === msg.mode)?.label}
                      </div>
                    )}

                    {/* Image */}
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Uploaded"
                        style={{
                          maxWidth: 280,
                          maxHeight: 280,
                          borderRadius: 'var(--radius)',
                          objectFit: 'cover',
                        }}
                      />
                    )}

                    {/* Thinking toggle */}
                    {msg.thinking && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleThinking(msg.id)}
                        style={{ fontSize: 11, padding: '2px 6px', alignSelf: 'flex-start' }}
                      >
                        {showThinking[msg.id] ? '\u25BE' : '\u25B8'} thinking
                      </button>
                    )}
                    {msg.thinking && showThinking[msg.id] && (
                      <div style={{
                        padding: '8px 12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius)',
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        fontStyle: 'italic',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                      }}>
                        {msg.thinking}
                      </div>
                    )}

                    {/* Message content */}
                    {editingMsgId === msg.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          className="textarea"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{ minHeight: 80, fontSize: 14 }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingMsgId(null); setEditText(''); }}>
                            Cancel
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={saveEditMessage}>
                            Save & Resend
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: msg.role === 'user' ? '10px 14px' : '12px 16px',
                          borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: msg.role === 'user'
                            ? 'linear-gradient(135deg, var(--accent-dim), #256b29)'
                            : 'var(--bg-tertiary)',
                          border: msg.role === 'user' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid var(--border)',
                          color: msg.role === 'user' ? '#e8f5e9' : 'var(--text-primary)',
                          lineHeight: 1.7,
                          position: 'relative',
                          boxShadow: msg.role === 'user'
                            ? '0 1px 6px rgba(76, 175, 80, 0.1)'
                            : '0 1px 4px rgba(0, 0, 0, 0.15)',
                        }}
                      >
                        {msg.role === 'user' ? (
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{displayContent}</div>
                        ) : (
                          <>
                            {displayContent ? (
                              <div className={isStreamingThis ? 'streaming-cursor' : ''}>
                                <MarkdownContent content={displayContent} />
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="spinner" />
                                Analyzing...
                              </span>
                            )}
                            {displayContent && <CopyButton text={displayContent} />}
                          </>
                        )}
                      </div>
                    )}

                    {/* Message actions */}
                    {!editingMsgId && (
                      <div className="msg-actions" style={{
                        display: 'flex',
                        gap: 2,
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        marginTop: 2,
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            navigator.clipboard.writeText(displayContent);
                          }}
                          title="Copy"
                          style={{ fontSize: 11, padding: '2px 6px' }}
                        >
                          Copy
                        </button>
                        {msg.role === 'user' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEditMessage(msg.id)}
                            title="Edit & resend"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                          >
                            Edit
                          </button>
                        )}
                        {msg.role === 'assistant' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => regenerateMessage(msg.id)}
                            title="Regenerate"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                            disabled={isLoading}
                          >
                            Regen
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => deleteMessage(msg.id)}
                          title="Delete"
                          style={{ fontSize: 11, padding: '2px 6px', color: 'var(--text-dim)' }}
                        >
                          Del
                        </button>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      padding: '0 4px',
                      textAlign: msg.role === 'user' ? 'right' : 'left',
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={chatEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {isUserScrolledUp.current && (
            <button
              onClick={scrollToBottom}
              style={{
                position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                zIndex: 5, borderRadius: 20, padding: '6px 16px', fontSize: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', boxShadow: 'var(--shadow)',
              }}
            >
              Scroll to bottom
            </button>
          )}

          {/* Web Search Results */}
          {(webSearchResults || isSearchingWeb) && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', maxHeight: 160, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {'\u{1F310}'} Web Results for "{webSearchQuery}"
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setWebSearchResults(null); setWebSearchQuery(''); }} style={{ fontSize: 10, padding: '2px 6px' }}>
                  Dismiss
                </button>
              </div>
              {isSearchingWeb ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Searching...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {webSearchResults?.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.title}</span>
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 10 }}>(source)</a>}
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>{r.snippet}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                    Results will be included as context in your next message.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input Area */}
          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            {/* Image preview */}
            {imagePreview && (
              <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
                <img
                  src={imagePreview}
                  alt="Upload preview"
                  style={{ maxHeight: 80, borderRadius: 'var(--radius)' }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setImagePreview(null)}
                  style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px' }}
                >
                  x
                </button>
              </div>
            )}

            {/* # web search indicator */}
            {input.startsWith('#') && input.length > 1 && (
              <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                <span>{'\u{1F310}'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>Press <strong>Enter</strong> to search: <em>{input.slice(1).trim()}</em></span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                title="Upload image"
                style={{ padding: '8px 12px', flexShrink: 0 }}
              >
                {'\u{1F4F7}'}
              </button>
              <textarea
                ref={textareaRef}
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${currentMode.label.toLowerCase()}... or type #query to search web`}
                disabled={isLoading}
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  minHeight: 40,
                  maxHeight: 150,
                  paddingTop: 10,
                  paddingBottom: 10,
                  lineHeight: 1.5,
                }}
              />
              {isLoading ? (
                <button className="btn btn-ghost" onClick={stopGeneration} style={{ flexShrink: 0 }}>
                  Stop
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (input.startsWith('#') && input.length > 1) {
                      handleWebSearch(input.slice(1).trim());
                    } else {
                      sendMessage();
                    }
                  }}
                  disabled={!input.trim() && !imagePreview}
                  style={{ flexShrink: 0 }}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Context Sidebar */}
        {showContext && (
          <div className="layout-split-side" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Plant Context */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Plant Context</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="input-group">
                  <label>Strain</label>
                  <input
                    className="input"
                    value={plantContext.strain}
                    onChange={(e) => setPlantContext((p) => ({ ...p, strain: e.target.value }))}
                    placeholder="e.g. Blue Dream"
                  />
                </div>
                <div className="input-group">
                  <label>Growth Stage</label>
                  <select
                    className="select"
                    value={plantContext.growthStage}
                    onChange={(e) => setPlantContext((p) => ({ ...p, growthStage: e.target.value as GrowthStage }))}
                  >
                    <option value="">-- Select --</option>
                    {GROWTH_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Medium</label>
                  <input
                    className="input"
                    value={plantContext.medium}
                    onChange={(e) => setPlantContext((p) => ({ ...p, medium: e.target.value }))}
                    placeholder="e.g. Soil, Coco"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="input-group">
                    <label>pH</label>
                    <input
                      className="input"
                      value={plantContext.ph}
                      onChange={(e) => setPlantContext((p) => ({ ...p, ph: e.target.value }))}
                      placeholder="6.5"
                    />
                  </div>
                  <div className="input-group">
                    <label>Temp ({'\u00B0'}C)</label>
                    <input
                      className="input"
                      value={plantContext.temp}
                      onChange={(e) => setPlantContext((p) => ({ ...p, temp: e.target.value }))}
                      placeholder="24"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="input-group">
                    <label>Humidity (%)</label>
                    <input
                      className="input"
                      value={plantContext.humidity}
                      onChange={(e) => setPlantContext((p) => ({ ...p, humidity: e.target.value }))}
                      placeholder="50"
                    />
                  </div>
                  <div className="input-group">
                    <label>Light Hours</label>
                    <input
                      className="input"
                      value={plantContext.lightHours}
                      onChange={(e) => setPlantContext((p) => ({ ...p, lightHours: e.target.value }))}
                      placeholder="18"
                    />
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                Context is included in all messages automatically.
              </p>
            </div>

            {/* Mode Info */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>
                {currentMode.icon} {currentMode.label}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {currentMode.value === 'general' && 'General cannabis cultivation Q&A. Ask anything about growing.'}
                {currentMode.value === 'diagnosis' && 'Systematic plant diagnosis. Describe symptoms and get treatment plans.'}
                {currentMode.value === 'analysis' && 'Growth optimization analysis. Get tips to improve yield and quality.'}
                {currentMode.value === 'nutrients' && 'Nutrient expertise. Feeding schedules, deficiencies, and lockout solutions.'}
                {currentMode.value === 'environment' && 'Environmental optimization. VPD, lighting, temperature, and humidity tuning.'}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {QUICK_ACTIONS.filter((a) => a.mode === chatMode).map((action, i) => (
                  <button
                    key={i}
                    className="btn btn-secondary btn-sm"
                    onClick={() => sendMessage(action.prompt)}
                    style={{ fontSize: 11, justifyContent: 'flex-start', gap: 8 }}
                  >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
                {QUICK_ACTIONS.filter((a) => a.mode === chatMode).length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    No quick actions for this mode.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setShowHistory(false)}>
          <div className="card" style={{ width: 480, maxHeight: 500, overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title">Chat History</div>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Ctrl+K</span>
            </div>
            <input
              className="input"
              placeholder="Search history..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              autoFocus
              style={{ marginBottom: 12, fontSize: 13 }}
            />
            {filteredHistory.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {historySearch ? 'No matching chats found.' : 'No saved chats yet.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredHistory.map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => loadHistory(h)}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', flex: 1 }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{h.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          {h.messages.length} messages {'\u00B7'} {new Date(h.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => deleteHistory(h.id, e)}
                      title="Delete"
                      style={{ color: 'var(--text-dim)', padding: '4px 8px' }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS for hover actions */}
      <style>{`
        .chat-msg-row:hover .msg-actions { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
