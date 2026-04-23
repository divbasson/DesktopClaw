const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { EventEmitter } = require('node:events');
const { randomUUID, randomBytes, createHash, generateKeyPairSync, createPrivateKey, sign } = require('node:crypto');

const PROTOCOL_VERSION = 3;
const DEFAULT_SESSION_KEY = 'main';
const DEFAULT_OPERATOR_SCOPES = ['operator.read', 'operator.write'];
const CHAT_HISTORY_LIMIT = 200;
const CHAT_POLL_INTERVAL_MS = 1200;
const CHAT_REPLY_TIMEOUT_MS = 45000;

function getApp() {
  try {
    const { app } = require('electron');
    return app;
  } catch {
    return null;
  }
}

function getUserDataPath() {
  const app = getApp();
  if (app?.getPath) {
    try {
      return app.getPath('userData');
    } catch {
      // Fall through to workspace fallback.
    }
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'desktopclaw');
  }
  return path.join(process.cwd(), '.desktopclaw-runtime');
}

function getDeviceStorePath() {
  return path.join(getUserDataPath(), 'gateway-device.json');
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padding), 'base64');
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function createDeviceIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicKeyBytes = base64UrlDecode(publicJwk.x);

  return {
    version: 1,
    deviceId: sha256Hex(publicKeyBytes),
    publicKey: publicJwk.x,
    privateKey: privateJwk.d,
    createdAt: Date.now(),
    tokens: {},
  };
}

function loadDeviceStore() {
  const filePath = getDeviceStorePath();
  const existing = readJsonFile(filePath);
  if (existing?.version === 1 && typeof existing.deviceId === 'string' && typeof existing.publicKey === 'string' && typeof existing.privateKey === 'string') {
    const expectedDeviceId = sha256Hex(base64UrlDecode(existing.publicKey));
    if (expectedDeviceId !== existing.deviceId) {
      const repaired = {
        ...existing,
        deviceId: expectedDeviceId,
      };
      writeJsonFile(filePath, repaired);
      return repaired;
    }
    return existing;
  }

  const created = createDeviceIdentity();
  writeJsonFile(filePath, created);
  return created;
}

function saveDeviceStore(store) {
  writeJsonFile(getDeviceStorePath(), store);
}

async function signTextWithDevice(privateKeyBase64Url, text) {
  const store = loadDeviceStore();
  const keyObject = createPrivateKey({
    format: 'jwk',
    key: {
      crv: 'Ed25519',
      d: privateKeyBase64Url,
      kty: 'OKP',
      x: store.publicKey,
    },
  });
  return base64UrlEncode(sign(null, Buffer.from(text, 'utf8'), keyObject));
}

function buildSignaturePayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return ['v2', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token || '', nonce].join('|');
}

function getGatewayClientIdentity(config) {
  return {
    id: config.gateway?.clientId || 'gateway-client',
    mode: config.gateway?.clientMode || 'backend',
  };
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim();
  return trimmed;
}

function toWebSocketUrl(rawUrl) {
  const normalized = normalizeBaseUrl(rawUrl);
  if (!normalized) {
    throw new Error('Gateway URL is empty. Set gateway.baseUrl in settings.');
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Gateway URL is invalid: ${normalized}`);
  }

  if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Gateway URL must use ws://, wss://, http://, or https://. Received: ${normalized}`);
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = '/';
  }

  return parsed.toString();
}

function normalizeGatewayError(error) {
  if (!error) return 'Unknown gateway error';
  if (typeof error === 'string') return error;

  const detailsCode = error?.details?.code;
  const reason = error?.details?.reason;
  const message = error?.message || error?.error || 'Gateway request failed';

  if (detailsCode === 'PAIRING_REQUIRED') {
    if (reason === 'scope-upgrade') return 'Gateway device scope upgrade needs approval.';
    if (reason === 'role-upgrade') return 'Gateway device role upgrade needs approval.';
    if (reason === 'metadata-upgrade') return 'Gateway device identity changed and must be approved again.';
    return 'Gateway pairing approval is required for this device.';
  }

  if (detailsCode === 'AUTH_TOKEN_MISMATCH') {
    return 'Gateway token mismatch. Check the token in settings.';
  }

  if (detailsCode === 'AUTH_PASSWORD_MISMATCH') {
    return 'Gateway password mismatch. Check the password in settings.';
  }

  if (detailsCode === 'DEVICE_AUTH_NONCE_REQUIRED' || detailsCode === 'DEVICE_AUTH_NONCE_MISMATCH') {
    return 'Gateway challenge signing failed because the device nonce was missing or stale.';
  }

  if (detailsCode === 'DEVICE_AUTH_SIGNATURE_INVALID') {
    return 'Gateway rejected the device signature.';
  }

  if (detailsCode === 'DEVICE_AUTH_DEVICE_ID_MISMATCH') {
    return 'Gateway rejected the device identity because the device id does not match the public key fingerprint.';
  }

  return message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MinimalWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = new URL(url);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.readyState = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const isSecure = this.url.protocol === 'wss:';
      const port = Number(this.url.port || (isSecure ? 443 : 80));
      const key = randomBytes(16).toString('base64');
      const requestPath = `${this.url.pathname || '/'}${this.url.search || ''}`;
      let settled = false;
      let handshakeBuffer = Buffer.alloc(0);

      const finishError = (error) => {
        if (settled) return;
        settled = true;
        this.readyState = 3;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const socket = isSecure
        ? tls.connect({
            host: this.url.hostname,
            port,
            servername: this.url.hostname,
          })
        : net.connect({
            host: this.url.hostname,
            port,
          });

      this.socket = socket;

      const onSocketError = (error) => {
        if (!settled) {
          finishError(error);
          return;
        }
        this.emit('error', error);
      };

      socket.on('error', onSocketError);

      const sendHandshake = () => {
        const headers = [
          `GET ${requestPath || '/'} HTTP/1.1`,
          `Host: ${this.url.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n');
        socket.write(headers);
      };

      if (isSecure) {
        socket.once('secureConnect', sendHandshake);
      } else {
        socket.once('connect', sendHandshake);
      }

      socket.on('data', (chunk) => {
        if (!settled) {
          handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
          const headerEnd = handshakeBuffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;

          const rawHeaders = handshakeBuffer.slice(0, headerEnd).toString('utf8');
          if (!rawHeaders.startsWith('HTTP/1.1 101')) {
            finishError(new Error(`Gateway WebSocket upgrade failed: ${rawHeaders.split('\r\n')[0] || 'unknown response'}`));
            socket.destroy();
            return;
          }

          settled = true;
          this.readyState = 1;
          const remainder = handshakeBuffer.slice(headerEnd + 4);
          if (remainder.length > 0) {
            this.handleFrameData(remainder);
          }
          resolve();
          this.emit('open');
          return;
        }

        this.handleFrameData(chunk);
      });

      socket.on('close', () => {
        this.readyState = 3;
        this.emit('close');
      });

      socket.on('end', () => {
        this.readyState = 3;
        this.emit('close');
      });
    });
  }

  handleFrameData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      let offset = 2;
      let payloadLength = second & 0x7f;
      const masked = (second & 0x80) !== 0;

      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) return;
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) return;
        const high = this.buffer.readUInt32BE(offset);
        const low = this.buffer.readUInt32BE(offset + 4);
        payloadLength = high * 2 ** 32 + low;
        offset += 8;
      }

      const maskBytes = masked ? 4 : 0;
      if (this.buffer.length < offset + maskBytes + payloadLength) return;

      let payload = this.buffer.slice(offset + maskBytes, offset + maskBytes + payloadLength);
      if (masked) {
        const mask = this.buffer.slice(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      this.buffer = this.buffer.slice(offset + maskBytes + payloadLength);

      if (opcode === 0x1) {
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === 0x8) {
        this.close();
      } else if (opcode === 0x9) {
        this.writeFrame(0xA, payload);
      }
    }
  }

  writeFrame(opcode, payloadBuffer) {
    if (!this.socket || this.readyState !== 1) {
      throw new Error('WebSocket is not open.');
    }

    const payload = Buffer.isBuffer(payloadBuffer) ? payloadBuffer : Buffer.from(payloadBuffer || '');
    const mask = randomBytes(4);
    let header;

    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = payload.length | 0x80;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126 | 0x80;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127 | 0x80;
      header.writeUInt32BE(Math.floor(payload.length / 2 ** 32), 2);
      header.writeUInt32BE(payload.length >>> 0, 6);
    }

    header[0] = 0x80 | (opcode & 0x0f);

    const maskedPayload = Buffer.from(payload);
    for (let index = 0; index < maskedPayload.length; index += 1) {
      maskedPayload[index] ^= mask[index % 4];
    }

    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  send(text) {
    this.writeFrame(0x1, Buffer.from(String(text), 'utf8'));
  }

  close() {
    if (this.readyState === 2 || this.readyState === 3) return;
    this.readyState = 2;
    try {
      this.writeFrame(0x8, Buffer.alloc(0));
    } catch {
      // Ignore if already closed enough that frame send fails.
    }
    this.socket?.end();
    this.socket?.destroy();
    this.readyState = 3;
  }
}

function getTextFromMessage(message) {
  if (!message || typeof message !== 'object') return '';

  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }

  if (Array.isArray(message.content)) {
    const text = message.content
      .filter((entry) => entry?.type === 'text' && typeof entry.text === 'string')
      .map((entry) => entry.text.trim())
      .filter(Boolean)
      .join('\n');
    if (text) return text;
  }

  if (typeof message.message === 'string' && message.message.trim()) {
    return message.message.trim();
  }

  return '';
}

function isAssistantMessage(message) {
  return String(message?.role || '').toLowerCase() === 'assistant';
}

function fingerprintMessage(message) {
  const id = String(message?.id || message?.messageId || message?.uuid || '');
  const timestamp = String(message?.timestamp || message?.createdAt || message?.created_at || '');
  const role = String(message?.role || '');
  const text = getTextFromMessage(message);
  return `${id}|${timestamp}|${role}|${text}`;
}

function isUserMessageMatch(message, expectedText, earliestTimestamp) {
  if (String(message?.role || '').toLowerCase() !== 'user') return false;
  const text = getTextFromMessage(message);
  if (text !== expectedText) return false;
  const timestamp = Number(message?.timestamp || message?.createdAt || 0);
  return !earliestTimestamp || !Number.isFinite(timestamp) || timestamp >= earliestTimestamp;
}

class GatewayWebSocketClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.connectPromise = null;
    this.pendingRequests = new Map();
    this.isReady = false;
    this.lastHello = null;
    this.eventSubscribers = new Set();
  }

  async ensureConnected() {
    if (this.isReady && this.socket?.readyState === 1) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = null;
      });
    }

    return this.connectPromise;
  }

  buildConnectParams(nonce) {
    const gatewayConfig = this.config.gateway || {};
    const store = loadDeviceStore();
    const role = 'operator';
    const clientIdentity = getGatewayClientIdentity(this.config);
    const storedTokenEntry = store.tokens?.[role];
    const configuredToken = gatewayConfig.token?.trim() || '';
    const configuredPassword = gatewayConfig.password?.trim() || '';
    const authToken = configuredToken || storedTokenEntry?.deviceToken || '';
    const scopes = Array.isArray(storedTokenEntry?.scopes) && storedTokenEntry.scopes.length > 0
      ? storedTokenEntry.scopes
      : DEFAULT_OPERATOR_SCOPES;
    const signedAtMs = Date.now();
    const signaturePayload = buildSignaturePayload({
      deviceId: store.deviceId,
      clientId: clientIdentity.id,
      clientMode: clientIdentity.mode,
      role,
      scopes,
      signedAtMs,
      token: authToken,
      nonce,
    });

    return signTextWithDevice(store.privateKey, signaturePayload).then((signature) => ({
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: clientIdentity.id,
        version: this.config.appVersion || '0.1.0',
        platform: process.platform,
        mode: clientIdentity.mode,
      },
      role,
      scopes,
      caps: [],
      commands: [],
      permissions: {},
      auth: {
        ...(authToken ? { token: authToken } : {}),
        ...(configuredPassword ? { password: configuredPassword } : {}),
      },
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      userAgent: `desktopclaw/${this.config.appVersion || '0.1.0'}`,
      device: {
        id: store.deviceId,
        publicKey: store.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      },
    }));
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = toWebSocketUrl(this.config.gateway.baseUrl || this.config.gateway.eventsUrl);
      const socket = new MinimalWebSocket(url);
      let settled = false;
      let challengeNonce = null;

      const cleanup = () => {
        socket.off('open', handleOpen);
        socket.off('message', handleMessage);
        socket.off('error', handleError);
        socket.off('close', handleClose);
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          socket.close();
        } catch {
          // Ignore close errors during failed connect.
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.socket = socket;
        this.isReady = true;
        socket.on('message', this.handleMessage);
        socket.on('close', this.handleClose);
        socket.on('error', this.handleSocketError);
        resolve();
      };

      const handleOpen = () => {
        // The gateway sends connect.challenge after open; wait for it.
      };

      const handleMessage = async (rawMessage) => {
        let data;
        try {
          data = JSON.parse(String(rawMessage));
        } catch {
          fail(new Error('Gateway sent invalid JSON during connect.'));
          return;
        }

        if (data?.type === 'event' && data?.event === 'connect.challenge') {
          challengeNonce = data?.payload?.nonce;
          if (!challengeNonce) {
            fail(new Error('Gateway connect.challenge did not include a nonce.'));
            return;
          }

          try {
            const params = await this.buildConnectParams(challengeNonce);
            socket.send(JSON.stringify({
              type: 'req',
              id: 'connect-1',
              method: 'connect',
              params,
            }));
          } catch (error) {
            fail(error);
          }
          return;
        }

        if (data?.type === 'res' && data?.id === 'connect-1') {
          if (!data.ok) {
            fail(new Error(normalizeGatewayError(data.error)));
            return;
          }

          this.lastHello = data.payload || null;
          this.persistHelloAuth(data.payload?.auth);
          succeed();
          return;
        }

        if (data?.type === 'event' && !challengeNonce) {
          fail(new Error('Gateway did not send connect.challenge before other events.'));
        }
      };

      const handleError = () => {
        fail(new Error('Gateway WebSocket connection failed.'));
      };

      const handleClose = () => {
        fail(new Error('Gateway closed the WebSocket during connect.'));
      };

      socket.on('open', handleOpen);
      socket.on('message', handleMessage);
      socket.on('error', handleError);
      socket.on('close', handleClose);
      socket.connect().catch(fail);
    });
  }

  persistHelloAuth(auth) {
    if (!auth || typeof auth !== 'object') return;

    const store = loadDeviceStore();
    const primaryRole = typeof auth.role === 'string' ? auth.role : 'operator';
    const nextTokens = { ...(store.tokens || {}) };

    if (typeof auth.deviceToken === 'string' && auth.deviceToken.trim()) {
      nextTokens[primaryRole] = {
        deviceToken: auth.deviceToken.trim(),
        scopes: Array.isArray(auth.scopes) && auth.scopes.length > 0 ? auth.scopes : DEFAULT_OPERATOR_SCOPES,
        updatedAt: Date.now(),
      };
    }

    for (const entry of Array.isArray(auth.deviceTokens) ? auth.deviceTokens : []) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.deviceToken !== 'string' || !entry.deviceToken.trim()) continue;
      if (typeof entry.role !== 'string' || !entry.role.trim()) continue;
      nextTokens[entry.role] = {
        deviceToken: entry.deviceToken.trim(),
        scopes: Array.isArray(entry.scopes) ? entry.scopes : [],
        updatedAt: Date.now(),
      };
    }

    saveDeviceStore({
      ...store,
      tokens: nextTokens,
    });
  }

  handleSocketError = () => {
    // Most actionable close state is handled via close, but keep pending calls from hanging.
  };

  handleClose = () => {
    this.isReady = false;
    this.socket = null;
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const entry of pending) {
      entry.reject(new Error('Gateway connection closed.'));
    }
  };

  handleMessage = (rawMessage) => {
    let data;
    try {
      data = JSON.parse(String(rawMessage));
    } catch {
      return;
    }

    if (data?.type === 'res' && typeof data.id === 'string') {
      const pending = this.pendingRequests.get(data.id);
      if (!pending) return;
      this.pendingRequests.delete(data.id);
      if (data.ok) {
        pending.resolve(data.payload);
      } else {
        pending.reject(new Error(normalizeGatewayError(data.error)));
      }
      return;
    }

    if (data?.type === 'event') {
      for (const subscriber of this.eventSubscribers) {
        try {
          subscriber(data);
        } catch {
          // Ignore subscriber failures.
        }
      }
    }
  };

  subscribe(listener) {
    this.eventSubscribers.add(listener);
    return () => {
      this.eventSubscribers.delete(listener);
    };
  }

  async request(method, params = {}) {
    await this.ensureConnected();
    const id = randomUUID();
    const payload = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = this.config.gateway?.timeoutMs || 15000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Gateway request timed out: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      try {
        this.socket.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  close() {
    this.isReady = false;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors.
      }
      this.socket = null;
    }
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const entry of pending) {
      entry.reject(new Error('Gateway client closed.'));
    }
  }
}

class OpenClawClient {
  constructor(config) {
    this.config = config;
    this.gatewayClient = new GatewayWebSocketClient({
      ...config,
      appVersion: config.appVersion || '0.1.0',
    });
  }

  async sendQuery(text) {
    if (this.config.gateway.mode === 'mock') {
      return {
        ok: true,
        text: `Mock OpenClaw response: I heard "${text}". Switch gateway.mode to "gateway" and point the gateway URL at your OpenClaw WebSocket endpoint.`,
        raw: { mock: true },
      };
    }

    const sessionKey = this.config.gateway.sessionKey || DEFAULT_SESSION_KEY;
    const before = await this.gatewayClient.request('chat.history', {
      sessionKey,
      limit: CHAT_HISTORY_LIMIT,
    });
    const previousMessages = Array.isArray(before?.messages) ? before.messages : [];
    const previousAssistantFingerprints = new Set(
      previousMessages
        .filter(isAssistantMessage)
        .map(fingerprintMessage),
    );

    const sendResponse = await this.gatewayClient.request('chat.send', {
      sessionKey,
      message: text,
      deliver: false,
      idempotencyKey: randomUUID(),
    });

    const runId = typeof sendResponse?.runId === 'string' ? sendResponse.runId : null;
    const deadline = Date.now() + Math.max(this.config.gateway.timeoutMs || 15000, CHAT_REPLY_TIMEOUT_MS);
    let resolvedText = '';
    let stopListening = null;

    const eventResult = new Promise((resolve, reject) => {
      stopListening = this.gatewayClient.subscribe((event) => {
        if (event?.event !== 'chat') return;
        const payload = event?.payload;
        if (!payload || payload.sessionKey !== sessionKey) return;
        if (runId && payload.runId && payload.runId !== runId) return;

        const state = String(payload.state || '').toLowerCase();
        const message = payload.message;
        const textFromEvent = getTextFromMessage(message);
        if (textFromEvent) {
          resolvedText = textFromEvent;
        }

        if (state === 'error') {
          reject(new Error(payload.errorMessage || 'Gateway chat run failed.'));
          return;
        }

        if (state === 'aborted') {
          reject(new Error('Gateway chat run was aborted.'));
          return;
        }

        if (state === 'final') {
          if (message && isAssistantMessage(message)) {
            resolve({
              ok: true,
              text: textFromEvent || 'OpenClaw replied, but no text content was returned.',
              raw: message,
            });
            return;
          }

          if (resolvedText) {
            resolve({
              ok: true,
              text: resolvedText,
              raw: payload,
            });
          }
        }
      });
    });

    while (Date.now() < deadline) {
      const remaining = Math.max(0, deadline - Date.now());
      const race = await Promise.race([
        eventResult.then((value) => ({ kind: 'event', value })).catch((error) => ({ kind: 'error', error })),
        sleep(Math.min(CHAT_POLL_INTERVAL_MS, remaining)).then(() => ({ kind: 'poll' })),
      ]);

      if (race.kind === 'event') {
        stopListening?.();
        return race.value;
      }

      if (race.kind === 'error') {
        stopListening?.();
        throw race.error;
      }

      const history = await this.gatewayClient.request('chat.history', {
        sessionKey,
        limit: CHAT_HISTORY_LIMIT,
      });
      const messages = Array.isArray(history?.messages) ? history.messages : [];
      const newAssistantMessages = messages
        .filter(isAssistantMessage)
        .filter((message) => !previousAssistantFingerprints.has(fingerprintMessage(message)));

      if (newAssistantMessages.length > 0) {
        const latestAssistant = newAssistantMessages[newAssistantMessages.length - 1];
        stopListening?.();
        return {
          ok: true,
          text: getTextFromMessage(latestAssistant) || 'OpenClaw replied, but no text content was returned.',
          raw: latestAssistant,
        };
      }
    }

    stopListening?.();
    throw new Error('OpenClaw accepted the message, but no assistant reply arrived before timeout.');
  }

  async getStatus() {
    if (this.config.gateway.mode === 'mock') {
      return {
        ok: true,
        data: {
          status: 'mock-online',
          sessions: 1,
          agents: 1,
        },
      };
    }

    const [health, sessions] = await Promise.all([
      this.gatewayClient.request('health', {}).catch(() => this.gatewayClient.request('status', {}).catch(() => null)),
      this.gatewayClient.request('sessions.list', {}).catch(() => null),
    ]);

    const sessionRows = Array.isArray(sessions?.sessions) ? sessions.sessions : [];
    const agentCount = new Set(
      sessionRows
        .map((row) => String(row?.key || ''))
        .map((key) => key.match(/^agent:([^:]+)/)?.[1])
        .filter(Boolean),
    ).size;

    return {
      ok: true,
      data: {
        status: health?.status || health?.state || 'gateway-online',
        sessions: typeof sessions?.count === 'number' ? sessions.count : sessionRows.length,
        agents: agentCount || undefined,
        ...(health && typeof health === 'object' ? { health } : {}),
      },
    };
  }

  close() {
    this.gatewayClient.close();
  }
}

module.exports = { OpenClawClient };
