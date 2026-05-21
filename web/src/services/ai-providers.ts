import type { ProviderConfig, AIRequest, AIResponse } from '../types';

const STORAGE_KEY = 'cannaai_providers';

// ============================================
// Provider Storage
// ============================================

export function loadProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: ProviderConfig[] = JSON.parse(raw);
      const defaults = getDefaultProviders();
      // Merge in any default providers that aren't already saved
      const savedIds = new Set(saved.map((p) => p.id));
      const missing = defaults.filter((d) => !savedIds.has(d.id));
      if (missing.length > 0) {
        const merged = [...saved, ...missing];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
      return saved;
    }
  } catch { /* ignore */ }
  return getDefaultProviders();
}

export function saveProviders(providers: ProviderConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

function getDefaultProviders(): ProviderConfig[] {
  return [
    {
      id: 'lmstudio-default',
      type: 'lmstudio',
      name: 'LM Studio (Local)',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: '',
      textModel: '',
      visionModel: '',
      isDefault: true,
    },
    {
      id: 'openrouter-default',
      type: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      textModel: '',
      visionModel: '',
      isDefault: false,
    },
    {
      id: 'nvidia-nim-default',
      type: 'nvidia-nim',
      name: 'NVIDIA NIM',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '',
      textModel: '',
      visionModel: '',
      isDefault: false,
    },
    {
      id: 'openai-compatible-default',
      type: 'openai-compatible',
      name: 'OpenAI Compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      textModel: '',
      visionModel: '',
      isDefault: false,
    },
  ];
}

// ============================================
// Model Discovery
// ============================================

export async function fetchModels(provider: ProviderConfig): Promise<string[]> {
  try {
    const headers: Record<string, string> = {};
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
    if (provider.type === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'CannaAI Web';
    }

    const res = await fetch(buildUrl(provider, '/models'), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m: { id: string }) => m.id);
  } catch (err) {
    console.warn(`Failed to fetch models from ${provider.name}:`, err);
    return [];
  }
}

// ============================================
// Health Check
// ============================================

export async function checkProviderHealth(provider: ProviderConfig): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
}> {
  try {
    const models = await fetchModels(provider);
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================
// Execute AI Request
// ============================================

export async function executeRequest(
  provider: ProviderConfig,
  request: AIRequest
): Promise<AIResponse> {
  const hasImage = !!request.image;
  const model = selectModel(provider, request, hasImage);

  const messages = buildMessages(provider, request, hasImage);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }
  if (provider.type === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'CannaAI Web';
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: request.temperature ?? 0.7,
    stream: false,
  };

  body.max_tokens = request.maxTokens ?? 4096;

  // Request JSON output — only for providers that support json_object format.
  // LM Studio and NVIDIA NIM reject this field; their system prompt handles JSON output.
  if (request.responseFormat === 'json' && provider.type !== 'lmstudio' && provider.type !== 'nvidia-nim') {
    body.response_format = { type: 'json_object' };
  }

  // NVIDIA NIM: Kimi K2.6 uses a special format with chat_template_kwargs
  if (provider.type === 'nvidia-nim' && isKimiModel(model)) {
    body.chat_template_kwargs = { thinking: true };
    body.max_tokens = request.maxTokens ?? 16384;
    body.temperature = request.temperature ?? 1.0;
    body.top_p = 1.0;
  }
  // NVIDIA NIM: Other models use OpenAI-compatible with extra_body for reasoning
  else if (provider.type === 'nvidia-nim') {
    body.extra_body = {
      chat_template_kwargs: { enable_thinking: true },
      reasoning_budget: 16384,
    };
    body.temperature = request.temperature ?? 0.6;
    body.top_p = 0.95;
    body.max_tokens = request.maxTokens ?? 65536;
  }

  const timeout = request.timeout ?? 120000;

  let res: Response;
  try {
    res = await fetch(buildUrl(provider, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    return {
      success: false,
      content: '',
      model,
      provider: provider.name,
      error: err instanceof Error ? err.message : 'Network request failed',
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');

    // If the provider rejected response_format, retry without it
    if (res.status === 400 && errText.includes('response_format')) {
      delete body.response_format;
      let retryRes: Response;
      try {
        retryRes = await fetch(buildUrl(provider, '/chat/completions'), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
      } catch (retryErr) {
        return {
          success: false,
          content: '',
          model,
          provider: provider.name,
          error: retryErr instanceof Error ? retryErr.message : 'Network request failed on retry',
        };
      }
      if (retryRes.ok) {
        const retryData = await retryRes.json().catch(() => null);
        if (retryData) {
          const retryContent = (retryData.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || '';
          return {
            success: true,
            content: retryContent,
            model,
            provider: provider.name,
            usage: retryData.usage
              ? {
                  promptTokens: (retryData.usage as Record<string, number>).prompt_tokens,
                  completionTokens: (retryData.usage as Record<string, number>).completion_tokens,
                  totalTokens: (retryData.usage as Record<string, number>).total_tokens,
                }
              : undefined,
          };
        }
      }
    }

    return {
      success: false,
      content: '',
      model,
      provider: provider.name,
      error: `API error (${res.status}): ${errText}`,
    };
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    // JSON parse failed — try reading as text and salvaging content.
    // Some providers return slightly malformed JSON or trailing text.
    try {
      const rawText = await res.text();
      // Try to extract a JSON object from the raw text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          data = JSON.parse(jsonMatch[0]);
        } catch {
          // Still invalid — try extracting just the choices portion
          const choicesStart = rawText.indexOf('"choices"');
          if (choicesStart !== -1) {
            // Find the opening bracket of the array
            const bracketStart = rawText.indexOf('[', choicesStart);
            if (bracketStart !== -1) {
              // Find the matching closing bracket
              let depth = 0;
              let bracketEnd = -1;
              for (let i = bracketStart; i < rawText.length; i++) {
                if (rawText[i] === '[') depth++;
                if (rawText[i] === ']') {
                  depth--;
                  if (depth === 0) { bracketEnd = i + 1; break; }
                }
              }
              if (bracketEnd !== -1) {
                try {
                  data = { choices: JSON.parse(rawText.substring(bracketStart, bracketEnd)) };
                } catch {
                  // Give up on structured extraction
                }
              }
            }
          }
        }
      }
    } catch {
      // Can't even read as text
    }

    if (!data) {
      return {
        success: false,
        content: '',
        model,
        provider: provider.name,
        error: 'Invalid JSON response from API',
      };
    }
  }

  const content = (data!.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || '';

  return {
    success: true,
    content,
    model,
    provider: provider.name,
    usage: data!.usage
      ? {
          promptTokens: (data!.usage as Record<string, number>).prompt_tokens,
          completionTokens: (data!.usage as Record<string, number>).completion_tokens,
          totalTokens: (data!.usage as Record<string, number>).total_tokens,
        }
      : undefined,
  };
}

// ============================================
// Streaming Execution
// ============================================

export async function executeRequestStream(
  provider: ProviderConfig,
  request: AIRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<AIResponse> {
  const hasImage = !!request.image;
  const model = selectModel(provider, request, hasImage);
  const messages = buildMessages(provider, request, hasImage);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }
  if (provider.type === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'CannaAI Web';
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: request.temperature ?? 0.7,
    stream: true,
  };
  body.max_tokens = request.maxTokens ?? 4096;

  if (provider.type === 'nvidia-nim' && isKimiModel(model)) {
    body.chat_template_kwargs = { thinking: true };
    body.max_tokens = request.maxTokens ?? 16384;
    body.temperature = request.temperature ?? 1.0;
    body.top_p = 1.0;
  } else if (provider.type === 'nvidia-nim') {
    body.extra_body = {
      chat_template_kwargs: { enable_thinking: true },
      reasoning_budget: 16384,
    };
    body.temperature = request.temperature ?? 0.6;
    body.top_p = 0.95;
    body.max_tokens = request.maxTokens ?? 65536;
  }

  const timeout = request.timeout ?? 120000;

  let res: Response;
  try {
    res = await fetch(buildUrl(provider, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(timeout),
    });
  } catch (err) {
    if (signal?.aborted) {
      return { success: true, content: '', model, provider: provider.name };
    }
    return {
      success: false,
      content: '',
      model,
      provider: provider.name,
      error: err instanceof Error ? err.message : 'Network request failed',
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    return {
      success: false,
      content: '',
      model,
      provider: provider.name,
      error: `API error (${res.status}): ${errText}`,
    };
  }

  if (!res.body) {
    return {
      success: false,
      content: '',
      model,
      provider: provider.name,
      error: 'No response body for streaming',
    };
  }

  let fullContent = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(fullContent);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      return { success: true, content: fullContent, model, provider: provider.name };
    }
    throw err;
  }

  return {
    success: true,
    content: fullContent,
    model,
    provider: provider.name,
  };
}

// ============================================
// Multi-Provider Execution (Council)
// ============================================

export async function executeWithFallback(
  providers: ProviderConfig[],
  request: AIRequest
): Promise<AIResponse> {
  const active = providers.filter(
    (p) => p.textModel || p.visionModel
  );
  if (active.length === 0) {
    return {
      success: false,
      content: '',
      model: '',
      provider: '',
      error: 'No providers configured with models. Please configure at least one provider in Settings.',
    };
  }

  // Use default provider first, then fallback
  const sorted = [
    ...active.filter((p) => p.isDefault),
    ...active.filter((p) => !p.isDefault),
  ];

  let lastError = '';
  for (const provider of sorted) {
    const result = await executeRequest(provider, request);
    if (result.success) return result;
    lastError = result.error || 'Unknown error';
  }

  return {
    success: false,
    content: '',
    model: '',
    provider: '',
    error: `All providers failed. Last error: ${lastError}`,
  };
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Build the full request URL for a provider endpoint.
 * NVIDIA NIM doesn't send CORS headers, so browser requests are routed
 * through a public CORS proxy (corsproxy.io).
 */
function buildUrl(provider: ProviderConfig, endpoint: string): string {
  if (provider.type === 'nvidia-nim') {
    const target = `https://integrate.api.nvidia.com/v1${endpoint}`;
    return `https://corsproxy.io/?${encodeURIComponent(target)}`;
  }
  return `${provider.baseUrl}${endpoint}`;
}

function isKimiModel(model: string): boolean {
  return model.toLowerCase().includes('kimi');
}

function selectModel(
  provider: ProviderConfig,
  request: AIRequest,
  hasImage: boolean
): string {
  if (request.model) return request.model;
  if (hasImage && request.useVision !== false && provider.visionModel) {
    return provider.visionModel;
  }
  return provider.textModel || provider.visionModel || 'default';
}

function buildMessages(
  _provider: ProviderConfig,
  request: AIRequest,
  hasImage: boolean
): Array<{ role: string; content: string | Array<Record<string, unknown>> }> {
  const systemPrompt =
    request.systemPrompt ||
    'You are CannaAI, an expert cannabis and hemp cultivation specialist with deep knowledge of plant physiology, nutrient deficiencies, pests, diseases, trichome analysis, and strain-specific characteristics. Provide detailed, accurate analysis with clear reasoning.';

  const messages: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }> = [{ role: 'system', content: systemPrompt }];

  if (hasImage) {
    // Vision message format - OpenAI-compatible multimodal
    // Always include the image when one is attached, even if no dedicated vision
    // model is configured — many text models support vision natively.
    const imageUrl = request.image!.startsWith('data:')
      ? request.image!
      : `data:image/jpeg;base64,${request.image}`;

    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: request.prompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: request.prompt });
  }

  return messages;
}
