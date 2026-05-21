// ============================================
// Web Search Service for Plant Doctor Agent
// Supports Brave Search, Tavily, and SearXNG
// ============================================

import type { WebSearchConfig } from '../types';
import { loadJSON } from '../utils/storage';

const STORAGE_KEY = 'cannaai-web-search';

export function loadWebSearchConfig(): WebSearchConfig {
  return loadJSON<WebSearchConfig>(STORAGE_KEY, {
    enabled: false,
    provider: 'brave',
    braveApiKey: '',
    tavilyApiKey: '',
    searxngUrl: 'http://localhost:8888',
    maxResults: 5,
  });
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(
  query: string,
  config?: WebSearchConfig
): Promise<SearchResult[]> {
  const cfg = config || loadWebSearchConfig();
  if (!cfg.enabled) {
    return [{ title: 'Search disabled', url: '', snippet: 'Web search is not enabled. Enable it in Settings > Plant Doctor.' }];
  }

  try {
    switch (cfg.provider) {
      case 'brave':
        return await searchBrave(query, cfg.braveApiKey, cfg.maxResults);
      case 'tavily':
        return await searchTavily(query, cfg.tavilyApiKey, cfg.maxResults);
      case 'searxng':
        return await searchSearXNG(query, cfg.searxngUrl, cfg.maxResults);
      default:
        return [{ title: 'Unknown provider', url: '', snippet: `Unknown search provider: ${cfg.provider}` }];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return [{ title: 'Search failed', url: '', snippet: `Web search error: ${msg}` }];
  }
}

async function searchBrave(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  if (!apiKey) {
    return [{ title: 'Missing API key', url: '', snippet: 'Brave Search API key is not configured. Add it in Settings > Plant Doctor.' }];
  }

  const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!resp.ok) {
    throw new Error(`Brave API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const results: SearchResult[] = (data.web?.results || []).slice(0, maxResults).map((r: { title: string; url: string; description: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }));

  return results.length > 0 ? results : [{ title: 'No results', url: '', snippet: 'No search results found.' }];
}

async function searchTavily(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  if (!apiKey) {
    return [{ title: 'Missing API key', url: '', snippet: 'Tavily API key is not configured. Add it in Settings > Plant Doctor.' }];
  }

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: false,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Tavily API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const results: SearchResult[] = (data.results || []).slice(0, maxResults).map((r: { title: string; url: string; content: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));

  return results.length > 0 ? results : [{ title: 'No results', url: '', snippet: 'No search results found.' }];
}

async function searchSearXNG(query: string, baseUrl: string, maxResults: number): Promise<SearchResult[]> {
  const url = baseUrl.replace(/\/$/, '');
  const resp = await fetch(`${url}/search?q=${encodeURIComponent(query)}&format=json&pageno=1`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`SearXNG error: ${resp.status} ${resp.statusText}. Make sure your SearXNG server is running at ${url}`);
  }

  const data = await resp.json();
  const results: SearchResult[] = (data.results || []).slice(0, maxResults).map((r: { title: string; url: string; content: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));

  return results.length > 0 ? results : [{ title: 'No results', url: '', snippet: 'No search results found.' }];
}
