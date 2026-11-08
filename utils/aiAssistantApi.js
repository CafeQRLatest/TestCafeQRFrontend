import api, { getApiUrl } from './api';

/**
 * "Ask CafeQR" assistant client.
 *
 * Flow: the dashboard asks cafe-qr-backend for a short-lived, read-only AI token (POST /api/v1/ai/token,
 * authenticated with the normal login token), then calls the cafe-qr-ai service with it. The AI service can
 * only read, because the backend rejects every non-GET request made with that token.
 */

/** Super admins only for now. */
export const AI_ASSISTANT_ROLES = ['SUPER_ADMIN', 'ROLE_SUPER_ADMIN'];

/**
 * Ask CafeQR is not released yet: hidden everywhere whatever the saved setting says.
 * Set to true (with MCP_AVAILABLE in the backend's SystemConfigurationService) when it goes live.
 */
export const AI_ASSISTANT_AVAILABLE = false;

/** Settings > "Enable MCP" (configuration.mcpEnabled). */
export const isAiAssistantEnabled = (config) => AI_ASSISTANT_AVAILABLE
  && Boolean(config && (config.mcpEnabled === true || config.mcpEnabled === 'true'));

/** cafe-qr-ai base URL. Defaults to the API host (Caddy routes /api/assistant/* to the AI service). */
export const getAiBaseUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_AI_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return 'http://localhost:8090';
  return getApiUrl();
};

let cachedToken = null; // { token, expiresAtMs }

const getAiToken = async (forceRefresh = false) => {
  if (!forceRefresh && cachedToken && cachedToken.expiresAtMs - Date.now() > 60_000) {
    return cachedToken.token;
  }
  const res = await api.post('/api/v1/ai/token');
  const data = res?.data?.data || {};
  if (!data.token) throw new Error('Could not start the assistant. Please sign in again.');
  cachedToken = { token: data.token, expiresAtMs: Date.parse(data.expiresAt) || Date.now() + 15 * 60_000 };
  return cachedToken.token;
};

export const clearAiToken = () => {
  cachedToken = null;
};

const readError = async (res) => {
  try {
    const body = await res.json();
    return body?.error || body?.message;
  } catch {
    return null;
  }
};

const aiFetch = async (path, options = {}, retried = false) => {
  const token = await getAiToken(retried);
  const res = await fetch(`${getAiBaseUrl()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    clearAiToken();
    return aiFetch(path, options, true);
  }
  return res;
};

const aiJson = async (path, options) => {
  const res = await aiFetch(path, options);
  if (!res.ok) throw new Error((await readError(res)) || `Request failed (${res.status})`);
  return res.status === 204 ? null : res.json();
};

export const getAssistantUsage = () => aiJson('/api/assistant/usage');
export const listConversations = () => aiJson('/api/assistant/conversations');
export const getConversation = (id) => aiJson(`/api/assistant/conversations/${encodeURIComponent(id)}`);
export const deleteConversation = (id) => aiJson(`/api/assistant/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Parses one SSE frame ("event: x\ndata: {...}") into { event, data }. */
export const parseSseFrame = (frame) => {
  let event = 'message';
  const dataLines = [];
  frame.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  });
  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
};

/**
 * Asks a question and streams the answer.
 * onEvent receives: started {conversationId} | tool {tool, title} | token {text} | done {...} | error {message}.
 * Throws for errors returned before streaming (quota reached, invalid question...).
 */
export const streamChat = async ({ message, conversationId, onEvent, signal }) => {
  const res = await aiFetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, conversationId: conversationId || null }),
    signal,
  });
  if (!res.ok) {
    throw new Error((await readError(res)) || 'The assistant is not available right now.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop();
    frames.forEach((frame) => {
      const parsed = parseSseFrame(frame);
      if (parsed) onEvent(parsed);
    });
  }
  const last = parseSseFrame(buffer);
  if (last) onEvent(last);
};
