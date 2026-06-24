const { randomUUID } = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 30000;

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizePath(value, fallback) {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function buildUrl(baseUrl, requestPath) {
  const base = trimSlash(baseUrl);
  if (!base) {
    throw new Error('Hermes endpoint is empty. Set hermes.baseUrl in settings.');
  }
  return `${base}${normalizePath(requestPath)}`;
}

function getHeaders(config) {
  const hermes = config.hermes || {};
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': `desktopclaw/${config.appVersion || '0.1.0'}`,
  };
  if (hermes.token) {
    headers.Authorization = `Bearer ${hermes.token}`;
    headers['X-API-Key'] = hermes.token;
  }
  if (hermes.password) {
    headers['X-Hermes-Password'] = hermes.password;
  }
  return headers;
}

function getTextFromResponse(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload.text === 'string') return payload.text.trim();
  if (typeof payload.reply === 'string') return payload.reply.trim();
  if (typeof payload.response === 'string') return payload.response.trim();
  if (typeof payload.result === 'string') return payload.result.trim();
  if (typeof payload.output === 'string') return payload.output.trim();
  if (typeof payload.message === 'string') return payload.message.trim();
  if (typeof payload.assistant === 'string') return payload.assistant.trim();
  if (Array.isArray(payload.choices)) {
    const text = payload.choices
      .map((choice) => choice?.message?.content || choice?.delta?.content || choice?.text)
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }
  if (payload.message && typeof payload.message === 'object') return getTextFromResponse(payload.message);
  if (payload.data && typeof payload.data === 'object') return getTextFromResponse(payload.data);
  if (Array.isArray(payload.content)) {
    return payload.content
      .map((entry) => (typeof entry === 'string' ? entry : entry?.text))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

class HermesAgentClient {
  constructor(config) {
    this.config = config;
  }

  async requestJson(path, { method = 'GET', body = null, signal } = {}) {
    const hermes = this.config.hermes || {};
    const response = await fetch(buildUrl(hermes.baseUrl, path), {
      method,
      headers: getHeaders(this.config),
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const message = getTextFromResponse(payload) || response.statusText || 'Hermes request failed.';
      throw new Error(`Hermes ${method} ${path} failed (${response.status}): ${message}`);
    }
    return payload;
  }

  async requestWithTimeout(path, options = {}) {
    const hermes = this.config.hermes || {};
    const controller = new AbortController();
    const timeoutMs = Number(hermes.timeoutMs || this.config.gateway?.timeoutMs || DEFAULT_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.requestJson(path, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Hermes request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async sendQuery(text, options = {}) {
    const hermes = this.config.hermes || {};
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const emitProgress = (event, details = {}) => {
      onProgress?.({
        event,
        ts: Date.now(),
        ...details,
      });
    };

    if (hermes.mode === 'mock') {
      emitProgress('assistant-final', { text: `Mock Hermes response: I heard "${text}".` });
      return {
        ok: true,
        text: `Mock Hermes response: I heard "${text}". Switch Hermes mode to HTTP and point the endpoint at hermes-agent.`,
        raw: { mock: true },
      };
    }

    const sessionId = hermes.sessionId || hermes.sessionKey || 'main';
    const isOpenAiMode = hermes.mode !== 'http';
    const model = hermes.model || 'Hermes Agent';
    const body = isOpenAiMode
      ? {
          model,
          stream: false,
          messages: [
            {
              role: 'user',
              content: text,
            },
          ],
          metadata: {
            sessionId,
            source: 'desktopclaw',
            requestId: randomUUID(),
            ...(hermes.agentId ? { agentId: hermes.agentId } : {}),
          },
        }
      : {
          message: text,
          text,
          prompt: text,
          sessionId,
          session_id: sessionId,
          conversationId: sessionId,
          requestId: randomUUID(),
          ...(hermes.model ? { model: hermes.model } : {}),
          ...(hermes.agentId ? { agentId: hermes.agentId, agent_id: hermes.agentId } : {}),
        };

    emitProgress('sending', { sessionKey: sessionId });
    const configuredPath = hermes.chatPath || (isOpenAiMode ? '/v1/chat/completions' : '/chat');
    const paths = hermes.chatPath
      ? [configuredPath]
      : (isOpenAiMode ? ['/v1/chat/completions'] : ['/chat', '/api/chat', '/message', '/query', '/run']);
    let lastError = null;
    for (const path of paths) {
      try {
        const payload = await this.requestWithTimeout(path, { method: 'POST', body });
        const reply = getTextFromResponse(payload);
        emitProgress('assistant-final', { text: reply, raw: payload });
        return {
          ok: true,
          text: reply || 'Hermes replied, but no text content was returned.',
          raw: payload,
        };
      } catch (error) {
        lastError = error;
        if (!/failed \(404\)/i.test(String(error?.message || error))) break;
      }
    }

    throw lastError || new Error('Hermes request failed.');
  }

  async listModels() {
    const hermes = this.config.hermes || {};
    if (hermes.mode === 'mock') {
      return {
        ok: true,
        models: [{ id: 'mock-hermes', name: 'Mock Hermes', provider: 'hermes', key: 'hermes/mock-hermes' }],
      };
    }

    const path = hermes.modelsPath || (hermes.mode === 'http' ? '/models' : '/v1/models');
    try {
      const payload = await this.requestWithTimeout(path);
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : Array.isArray(payload)
            ? payload
            : [];
      const models = rows.map((model) => {
        const id = String(model?.id || model?.model || model?.name || model || '').trim();
        const provider = String(model?.provider || 'hermes').trim();
        return {
          ...(typeof model === 'object' ? model : {}),
          id,
          name: model?.name || id,
          provider,
          key: id.includes('/') ? id : `${provider}/${id}`,
        };
      }).filter((model) => model.id);
      return { ok: true, models, raw: payload };
    } catch {
      const model = String(hermes.model || '').trim();
      return {
        ok: true,
        models: model ? [{ id: model, name: model, provider: 'hermes', key: `hermes/${model}` }] : [],
      };
    }
  }

  async getSessionModel() {
    const hermes = this.config.hermes || {};
    const model = String(hermes.model || '').trim();
    return {
      ok: true,
      sessionKey: hermes.sessionId || 'main',
      modelProvider: model ? 'hermes' : '',
      model,
      modelKey: model ? `hermes/${model}` : '',
    };
  }

  async setSessionModel(modelKey) {
    const raw = String(modelKey || '').trim();
    const model = raw.includes('/') ? raw.split('/').slice(1).join('/') : raw;
    if (!model) {
      throw new Error('No Hermes model was selected.');
    }
    return {
      ok: true,
      modelKey: `hermes/${model}`,
      modelProvider: 'hermes',
      model,
      raw: { localSelection: true },
    };
  }

  getModelCapabilities() {
    return {
      modelSwitchSupported: true,
      reason: 'Hermes model selection is stored locally and sent with each request.',
    };
  }

  async getStatus() {
    const hermes = this.config.hermes || {};
    if (hermes.mode === 'mock') {
      return {
        ok: true,
        data: { status: 'mock-hermes-online', sessions: 1, agents: 1, provider: 'hermes' },
      };
    }

    const paths = hermes.statusPath ? [hermes.statusPath] : ['/health', '/status'];
    let lastError = null;
    for (const path of paths) {
      try {
        const payload = await this.requestWithTimeout(path);
        return {
          ok: true,
          data: {
            status: payload?.status || payload?.state || 'hermes-online',
            sessions: payload?.sessions,
            agents: payload?.agents,
            provider: 'hermes',
            health: payload,
          },
        };
      } catch (error) {
        lastError = error;
        if (!/failed \(404\)/i.test(String(error?.message || error))) break;
      }
    }
    throw lastError || new Error('Hermes status check failed.');
  }

  close() {}
}

module.exports = { HermesAgentClient };
