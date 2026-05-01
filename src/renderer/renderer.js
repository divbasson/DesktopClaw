// --- Markdown rendering utilities (copied from ui_shell.js) ---
function _inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
}

function renderMarkdown(raw) {
  const escaped = _escapeHtml(raw);
  const lines = escaped.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const hMatch = line.match(/^(#{1,3}) (.+)/);
    if (hMatch) {
      if (inList) { html += '</ul>'; inList = false; }
      const level = Math.min(hMatch[1].length + 1, 5);
      html += `<h${level}>${_inlineMd(hMatch[2])}</h${level}>`;
      continue;
    }
    const liMatch = line.match(/^[-*] (.+)/);
    if (liMatch) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${_inlineMd(liMatch[1])}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!line.trim()) { html += '<br>'; continue; }
    html += `<p>${_inlineMd(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
// --- Utility: Escape HTML for safe rendering ---
function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
const REQUEST_STATES = {
  QUEUED: 'queued',
  SENT: 'sent',
  WAITING: 'waiting',
  RESPONDING: 'responding',
  COMPLETED: 'completed',
  FAILED: 'failed',
  INTERRUPTED: 'interrupted',
  CANCELLED: 'cancelled',
};

const REQUEST_STATUS_TEXT = {
  [REQUEST_STATES.QUEUED]: 'Queued. I am getting ready.',
  [REQUEST_STATES.SENT]: 'Sent. I am listening for the reply.',
  [REQUEST_STATES.WAITING]: 'Still waiting. I have not dropped it.',
  [REQUEST_STATES.RESPONDING]: 'Reply is coming in.',
  [REQUEST_STATES.COMPLETED]: 'Done',
  [REQUEST_STATES.FAILED]: 'Needs attention',
  [REQUEST_STATES.INTERRUPTED]: 'Interrupted',
  [REQUEST_STATES.CANCELLED]: 'Cancelled locally',
};

class RequestManager {
  constructor({ container, historyList, diagnosticsList }) {
    this.container = container;
    this.historyList = historyList;
    this.diagnosticsList = diagnosticsList;
    this.requests = new Map();
    this.history = [];
    this.counter = 1;
    this.completedLifetimeMs = 2400;
    this.errorLifetimeMs = 7000;
    this.maxVisibleSessions = 4;
    this.maxHistory = 30;
    this.diagnostics = {
      gateway: 'unknown',
      agent: 'main',
      activeRequests: 0,
      lastEvent: 'renderer-started',
      tts: 'idle',
      model: 'unknown',
      updatedAt: Date.now(),
    };
  }

  createRequest(prompt, { source = 'Chat' } = {}) {
    const id = `request-${Date.now()}-${this.counter++}`;
    const card = document.createElement('div');
    card.className = `session-card state-${REQUEST_STATES.QUEUED}`;
    card.dataset.requestId = id;
    card.innerHTML = `
      <div class="session-row">
        <span class="session-dot" aria-hidden="true"></span>
        <div class="session-copy">
          <div class="session-meta">
            <span class="session-source">${_escapeHtml(source)}</span>
            <span class="session-elapsed">0s</span>
          </div>
          <div class="session-prompt">${_escapeHtml(prompt)}</div>
          <div class="session-status">${REQUEST_STATUS_TEXT[REQUEST_STATES.QUEUED]}</div>
        </div>
      </div>`;
    this.container.appendChild(card);
    this.requests.set(id, {
      id,
      card,
      prompt,
      source,
      state: REQUEST_STATES.QUEUED,
      response: '',
      error: '',
      cancelled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      removeTimer: null,
      progressTimers: [],
      elapsedTimer: null,
    });
    this.startElapsedClock(id);
    this.setDiagnostics({
      activeRequests: this.getActiveRequests().length,
      lastEvent: `queued: ${this.truncate(prompt, 44)}`,
    });
    this.trimVisibleSessions();
    this.scrollToLatest();
    return id;
  }

  getRequest(id) {
    return this.requests.get(id);
  }

  isCancelled(id) {
    return !!this.requests.get(id)?.cancelled;
  }

  getActiveRequests() {
    return [...this.requests.values()].filter((request) => (
      !request.cancelled
      && ![REQUEST_STATES.COMPLETED, REQUEST_STATES.FAILED, REQUEST_STATES.INTERRUPTED, REQUEST_STATES.CANCELLED].includes(request.state)
    ));
  }

  transition(id, state, { status, response, error, removeAfterMs } = {}) {
    const request = this.requests.get(id);
    if (!request) return;
    const terminalStates = [
      REQUEST_STATES.COMPLETED,
      REQUEST_STATES.FAILED,
      REQUEST_STATES.INTERRUPTED,
      REQUEST_STATES.CANCELLED,
    ];
    if (terminalStates.includes(request.state) && !terminalStates.includes(state)) {
      return;
    }
    if (request.removeTimer) {
      clearTimeout(request.removeTimer);
      request.removeTimer = null;
    }
    request.state = state;
    request.updatedAt = Date.now();
    if (response) request.response = response;
    if (error) request.error = error;

    request.card.className = `session-card state-${state}`;
    const statusDiv = request.card.querySelector('.session-status');
    if (statusDiv) {
      statusDiv.textContent = status || error || REQUEST_STATUS_TEXT[state] || state;
    }

    if (terminalStates.includes(state)) {
      this.clearProgressTimers(id);
      this.updateElapsed(id);
      clearInterval(request.elapsedTimer);
      request.elapsedTimer = null;
      this.pushHistory(request);
      const lifetime = removeAfterMs ?? (state === REQUEST_STATES.COMPLETED ? this.completedLifetimeMs : this.errorLifetimeMs);
      request.removeTimer = setTimeout(() => this.removeRequest(id), lifetime);
    }

    this.setDiagnostics({
      activeRequests: this.getActiveRequests().length,
      lastEvent: `${state}: ${this.truncate(request.prompt, 44)}`,
    });
    this.scrollToLatest();
  }

  scheduleProgress(id) {
    const milestones = [
      [2500, REQUEST_STATES.SENT, 'OpenClaw has it. I am watching for the reply.'],
      [8000, REQUEST_STATES.WAITING, 'Still waiting. I have not dropped it.'],
      [18000, REQUEST_STATES.WAITING, 'This is still running. You can keep using the app.'],
      [36000, REQUEST_STATES.WAITING, 'Still attached to this one. I will update you when it moves.'],
    ];
    const request = this.requests.get(id);
    if (!request) return;
    this.clearProgressTimers(id);
    request.progressTimers = milestones.map(([delay, state, status]) => setTimeout(() => {
      const latest = this.requests.get(id);
      if (!latest || latest.cancelled) return;
      if ([REQUEST_STATES.COMPLETED, REQUEST_STATES.FAILED, REQUEST_STATES.INTERRUPTED].includes(latest.state)) return;
      this.transition(id, state, { status });
    }, delay));
  }

  clearProgressTimers(id) {
    const request = this.requests.get(id);
    if (!request) return;
    for (const timer of request.progressTimers || []) clearTimeout(timer);
    request.progressTimers = [];
  }

  startElapsedClock(id) {
    const request = this.requests.get(id);
    if (!request) return;
    this.updateElapsed(id);
    request.elapsedTimer = setInterval(() => this.updateElapsed(id), 1000);
  }

  updateElapsed(id) {
    const request = this.requests.get(id);
    if (!request) return;
    const node = request.card.querySelector('.session-elapsed');
    if (!node) return;
    const seconds = Math.max(0, Math.round((Date.now() - request.createdAt) / 1000));
    node.textContent = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  cancelRequest(id) {
    const request = this.requests.get(id);
    if (!request) return false;
    request.cancelled = true;
    this.transition(id, REQUEST_STATES.CANCELLED, {
      status: 'Cancelled here. Late OpenClaw replies will be ignored.',
      removeAfterMs: 1800,
    });
    return true;
  }

  cancelActive() {
    const active = this.getActiveRequests();
    for (const request of active) this.cancelRequest(request.id);
    return active.length;
  }

  removeRequest(id) {
    const request = this.requests.get(id);
    if (!request) return;
    if (request.removeTimer) {
      clearTimeout(request.removeTimer);
    }
    clearInterval(request.elapsedTimer);
    this.clearProgressTimers(id);
    request.card.classList.add('removing');
    setTimeout(() => request.card.remove(), 220);
    this.requests.delete(id);
    this.setDiagnostics({ activeRequests: this.getActiveRequests().length });
  }

  trimVisibleSessions() {
    while (this.requests.size > this.maxVisibleSessions) {
      const oldestId = this.requests.keys().next().value;
      this.removeRequest(oldestId);
    }
  }

  pushHistory(request) {
    const alreadyExists = this.history.some((entry) => entry.id === request.id);
    if (alreadyExists) return;
    this.history.unshift({
      id: request.id,
      prompt: request.prompt,
      response: request.response || request.error || REQUEST_STATUS_TEXT[request.state],
      state: request.state,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    });
    this.history = this.history.slice(0, this.maxHistory);
    this.renderHistory();
  }

  renderHistory() {
    if (!this.historyList) return;
    if (this.history.length === 0) {
      this.historyList.innerHTML = '<div class="history-item">No recent messages yet.</div>';
      return;
    }
    this.historyList.innerHTML = this.history.map((entry) => `
      <article class="history-item">
        <div class="history-prompt">${_escapeHtml(this.truncate(entry.prompt, 140))}</div>
        <div class="history-response">${_escapeHtml(this.truncate(entry.response, 220))}</div>
        <div class="history-meta">${_escapeHtml(entry.state)} · ${new Date(entry.updatedAt).toLocaleTimeString()}</div>
      </article>
    `).join('');
  }

  setDiagnostics(next) {
    this.diagnostics = { ...this.diagnostics, ...next, updatedAt: Date.now() };
    this.renderDiagnostics();
  }

  renderDiagnostics() {
    if (!this.diagnosticsList) return;
    const rows = [
      ['Gateway', this.diagnostics.gateway],
      ['Agent', this.diagnostics.agent],
      ['Model', this.diagnostics.model],
      ['Active', String(this.diagnostics.activeRequests)],
      ['TTS', this.diagnostics.tts],
      ['Last event', this.diagnostics.lastEvent],
      ['Updated', new Date(this.diagnostics.updatedAt).toLocaleTimeString()],
    ];
    this.diagnosticsList.innerHTML = rows
      .map(([key, value]) => `<dt>${_escapeHtml(key)}</dt><dd>${_escapeHtml(value || 'unknown')}</dd>`)
      .join('');
  }

  truncate(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  }

  scrollToLatest() {
    requestAnimationFrame(() => {
      this.container.scrollTop = this.container.scrollHeight;
    });
  }
}
import { AnimationEngine } from './animation_engine.js';
import { TtsEngine } from './tts_engine.js';
import { WakeWordEngine } from './wake_word.js';
import { RendererOpenClawClient } from './openclaw_client.js';
import { RendererUiShell } from './ui_shell.js';

const app = document.getElementById('app');
const sessionStack = document.getElementById('session-stack');
const historyPanel = document.getElementById('history-panel');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');
const diagnosticsPanel = document.getElementById('diagnostics-panel');
const diagnosticsClose = document.getElementById('diagnostics-close');
const diagnosticsList = document.getElementById('diagnostics-list');
const requestManager = new RequestManager({
  container: sessionStack,
  historyList,
  diagnosticsList,
});
const pet = document.getElementById('pet');
const petShell = document.getElementById('pet-shell');
const accessories = document.getElementById('pet-accessories');
const mouth = document.querySelector('.mouth');
const bubble = document.getElementById('speech-bubble');
const textInput = document.getElementById('text-input');
const interactionShell = document.getElementById('interaction-shell');
const settingsPanel = document.getElementById('settings-panel');
const closeSettings = document.getElementById('close-settings');
const saveSettings = document.getElementById('save-settings');
const testStatus = document.getElementById('test-status');

const fields = {
  wakeWord: document.getElementById('wake-word'),
  wakeWordEnabled: document.getElementById('wake-word-enabled'),
  alwaysOnTop: document.getElementById('always-on-top'),
  mute: document.getElementById('mute'),
  volume: document.getElementById('volume'),
  voiceName: document.getElementById('voice-name'),
  availableVoices: [],
  clickThroughWhenIdle: document.getElementById('click-through-when-idle'),
  pollEnabled: document.getElementById('poll-enabled'),
  pollIntervalMs: document.getElementById('poll-interval-ms'),
  showNotifications: document.getElementById('show-notifications'),
  speakNotifications: document.getElementById('speak-notifications'),
  gatewayMode: document.getElementById('gateway-mode'),
  gatewayUrl: document.getElementById('gateway-url'),
  gatewayChatPath: document.getElementById('gateway-chat-path'),
  gatewayStatusPath: document.getElementById('gateway-status-path'),
  gatewayEventsUrl: document.getElementById('gateway-events-url'),
  gatewayEventsEnabled: document.getElementById('gateway-events-enabled'),
  gatewayToken: document.getElementById('gateway-token'),
  gatewayPassword: document.getElementById('gateway-password'),
  hotkeyListen: document.getElementById('hotkey-listen'),
};

const RANDOM_ACTIVITY_POOL = ['reading', 'coding', 'sleeping'];
const ACTIVITY_CLASS_NAMES = [
  'activity-reading',
  'activity-coding',
  'activity-sleeping',
  'activity-eating',
  'activity-music',
  'activity-musicOnly',
];
const MOOD_CLASS_NAMES = [
  'mood-calm',
  'mood-curious',
  'mood-focused',
  'mood-speaking',
  'mood-happy',
  'mood-concerned',
  'mood-sleepy',
];
const ACTIVITY_MIN_MS = 9000;
const ACTIVITY_MAX_MS = 17000;
const IDLE_GAP_MIN_MS = 14000;
const IDLE_GAP_MAX_MS = 28000;

let config;
let dragState = null;
let lastState = 'idle';
let composerPinned = false;
let composerHideTimer = null;
let dragMoved = false;
let voiceCaptureInFlight = false;
let activityTimer = null;
let activityEndTimer = null;
let currentActivity = null;
let currentActivityReason = null;
let pendingIdleActivityRestore = false;
let lastActivityAt = 0;
let audioIsActive = false;
let audioDebounceTimer = null;
let activeQueryCount = 0;
let speechInterruptSerial = 0;
let moodTimer = null;

const animationEngine = new AnimationEngine({
  app,
  mouth,
  config: { idle: { quirkMinSeconds: 10, quirkMaxSeconds: 30 } },
});
const uiShell = new RendererUiShell({ bubble, settingsPanel, fields });
const openclawClient = new RendererOpenClawClient();

class AudioCuePlayer {
  constructor() {
    this.start = new Audio('../assets/audio/start.mp3');
    this.stop = new Audio('../assets/audio/stop.mp3');
    for (const audio of [this.start, this.stop]) {
      audio.preload = 'auto';
      audio.volume = 0.62;
    }
  }

  play(which) {
    if (config?.mute) return;
    const audio = which === 'stop' ? this.stop : this.start;
    audio.currentTime = 0;
    audio.play().catch((error) => {
      reportRuntimeIssue(`Unable to play ${which} listening cue`, {
        name: error?.name,
        message: error?.message,
      }, 'info');
    });
  }
}

const audioCuePlayer = new AudioCuePlayer();

function reportRuntimeIssue(message, details = null, level = 'error') {
  window.desktopClaw.logMessage({
    scope: 'renderer-runtime',
    level,
    message,
    details,
  }).catch(() => {});
}

window.addEventListener('error', (event) => {
  reportRuntimeIssue('Unhandled renderer error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack || null,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error
    ? { name: event.reason.name, message: event.reason.message, stack: event.reason.stack }
    : event.reason;
  reportRuntimeIssue('Unhandled renderer rejection', reason);
});

function getVoices() {
  return window.speechSynthesis.getVoices().map((voice) => ({ name: voice.name, lang: voice.lang }));
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function setMood(mood, durationMs = 0) {
  clearTimeout(moodTimer);
  moodTimer = null;
  app.classList.remove(...MOOD_CLASS_NAMES);
  app.classList.add(`mood-${mood}`);
  if (durationMs > 0) {
    moodTimer = setTimeout(() => {
      app.classList.remove(...MOOD_CLASS_NAMES);
      app.classList.add(lastState === 'idle' ? 'mood-calm' : 'mood-focused');
    }, durationMs);
  }
}

function clearAccessoryLayer() {
  accessories.innerHTML = '';
  pet.classList.remove(...ACTIVITY_CLASS_NAMES);
}

function createHeadphones() {
  const wrapper = document.createElement('div');
  wrapper.className = 'accessory-headphones';

  const earLeft = document.createElement('span');
  earLeft.className = 'ear ear-left';
  const earRight = document.createElement('span');
  earRight.className = 'ear ear-right';

  wrapper.appendChild(earLeft);
  wrapper.appendChild(earRight);
  return wrapper;
}

function createLaptop() {
  const wrapper = document.createElement('div');
  wrapper.className = 'accessory-laptop';

  const screen = document.createElement('span');
  screen.className = 'screen';
  wrapper.appendChild(screen);
  return wrapper;
}

function createAccessoryForActivity(name) {
  switch (name) {
    case 'reading': {
      const book = document.createElement('div');
      book.className = 'accessory-book';
      return book;
    }
    case 'coding':
      return createLaptop();
    case 'sleeping': {
      const bubbleNode = document.createElement('div');
      bubbleNode.className = 'accessory-sleep-bubble';
      return bubbleNode;
    }
    case 'eating': {
      const snack = document.createElement('div');
      snack.className = 'accessory-snack';
      return snack;
    }
    case 'music':
      return createHeadphones();
    default:
      return null;
  }
}

function applyAccessoryActivity(name) {
  clearAccessoryLayer();
  if (!name) return;

  const className = name === 'music' && lastState !== 'idle'
    ? 'activity-musicOnly'
    : `activity-${name}`;

  pet.classList.add(className);

  const node = createAccessoryForActivity(name);
  if (node) {
    accessories.appendChild(node);
  }
}

function cancelActivityTimers() {
  clearTimeout(activityTimer);
  clearTimeout(activityEndTimer);
  activityTimer = null;
  activityEndTimer = null;
}

function scheduleIdleActivity() {
  cancelActivityTimers();
  if (audioIsActive || lastState !== 'idle' || composerPinned || !interactionShell.classList.contains('hidden') || !settingsPanel.classList.contains('hidden')) {
    return;
  }

  const waitMs = randomBetween(IDLE_GAP_MIN_MS, IDLE_GAP_MAX_MS);
  activityTimer = setTimeout(() => {
    if (audioIsActive || lastState !== 'idle' || composerPinned) return;
    const next = RANDOM_ACTIVITY_POOL[Math.floor(Math.random() * RANDOM_ACTIVITY_POOL.length)];
    beginActivity(next, 'idle-random');
  }, waitMs);
}

function endActivity({ preserveMusic = false } = {}) {
  clearTimeout(activityEndTimer);
  activityEndTimer = null;

  if (preserveMusic && audioIsActive) {
    beginActivity('music', 'audio');
    return;
  }

  currentActivity = null;
  currentActivityReason = null;
  clearAccessoryLayer();
  if (lastState === 'idle' && !audioIsActive) {
    scheduleIdleActivity();
  }
}

function beginActivity(name, reason = 'idle-random', durationMs = null) {
  cancelActivityTimers();
  currentActivity = name;
  currentActivityReason = reason;
  lastActivityAt = Date.now();
  applyAccessoryActivity(name);

  if (name === 'music') {
    return;
  }

  const lifetime = durationMs ?? randomBetween(ACTIVITY_MIN_MS, ACTIVITY_MAX_MS);
  activityEndTimer = setTimeout(() => {
    endActivity();
  }, lifetime);
}

function pauseActivityForState() {
  if (!currentActivity) return;
  if (currentActivity === 'music' && audioIsActive) {
    applyAccessoryActivity('music');
    return;
  }
  pendingIdleActivityRestore = currentActivityReason === 'idle-random';
  clearAccessoryLayer();
}

function resumeActivityIfNeeded() {
  if (audioIsActive) {
    beginActivity('music', 'audio');
    return;
  }

  if (pendingIdleActivityRestore) {
    pendingIdleActivityRestore = false;
    const sinceLast = Date.now() - lastActivityAt;
    if (sinceLast < 5000) {
      scheduleIdleActivity();
      return;
    }
  }

  if (!currentActivity) {
    scheduleIdleActivity();
    return;
  }

  applyAccessoryActivity(currentActivity);
}

function setInteractiveMode(_enabled) {
  // Click-through is now managed dynamically via the mousemove hit-test in applyCursorReaction.
}

function setState(state) {
  lastState = state;
  animationEngine.setState(state);
  if (state === 'idle') setMood(activeQueryCount > 0 ? 'focused' : 'calm');
  if (state === 'listening') setMood('curious');
  if (state === 'thinking') setMood('focused');
  if (state === 'speaking') setMood('speaking');
  if (state === 'error') setMood('concerned', 5000);
  const composerVisible = !interactionShell.classList.contains('hidden');
  const settingsVisible = !settingsPanel.classList.contains('hidden');
  setInteractiveMode(state !== 'idle' || composerVisible || settingsVisible || !config?.clickThroughWhenIdle);

  if (state === 'idle') {
    resumeActivityIfNeeded();
  } else {
    pauseActivityForState();
  }
  updateControlRail();
}

function openComposer({ focus = false, clear = false } = {}) {
  clearTimeout(composerHideTimer);
  interactionShell.classList.remove('hidden');
  composerPinned = focus;
  if (clear) textInput.value = '';
  setInteractiveMode(true);
  if (focus) {
    queueMicrotask(() => {
      textInput.focus();
      textInput.select();
    });
  }
}

function closeComposer(force = false) {
  if (!force && (composerPinned || document.activeElement === textInput || textInput.value.trim())) {
    return;
  }
  interactionShell.classList.add('hidden');
  composerPinned = false;
  if (document.activeElement === textInput) {
    textInput.blur();
  }
  setInteractiveMode(false);
  if (lastState === 'idle') {
    scheduleIdleActivity();
  }
}

function scheduleComposerClose(delay = 300) {
  clearTimeout(composerHideTimer);
  composerHideTimer = setTimeout(() => closeComposer(false), delay);
}

function showSpeech(text, timeoutMs = 8000) {
  uiShell.setBubble(text, timeoutMs);
  updateControlRail();
}

function classifyOpenClawResult(result, request) {
  const text = String(result?.text || '').trim();
  const error = String(result?.error || '').trim();
  const rawStatus = String(result?.data?.status || result?.raw?.status || '').toLowerCase();
  const combined = `${text}\n${error}\n${rawStatus}`.toLowerCase();

  if (request?.cancelled) return { type: 'irrelevant_session_event', display: false };
  if (result?.ok && text) return { type: 'assistant_final', text, display: true };
  if (/needs.*input|approval|required|authorize|permission/i.test(text || error)) {
    return { type: 'needs_user_input', text: text || error, display: true };
  }
  if (/gateway|models-loaded|model-selected|status|sessions|online|offline/i.test(rawStatus)) {
    return { type: 'gateway_status', text: text || error || rawStatus, display: false };
  }
  if (/requested model is not supported|retry|temporar|timeout|finished the run.*no assistant message/i.test(error)) {
    return { type: 'transient_error', text: error, display: false };
  }
  if (!result?.ok) return { type: 'transient_error', text: error || "I can't reach OpenClaw right now.", display: true };
  return { type: 'irrelevant_session_event', text: text || error, display: false };
}

function handleQueryProgress(requestId, progress) {
  if (!progress || requestManager.isCancelled(requestId)) return;
  const event = String(progress.event || '');
  const state = String(progress.state || '');
  const text = String(progress.text || '').trim();
  const shortText = text ? requestManager.truncate(text, 96) : '';

  if (event === 'history-loading') {
    requestManager.transition(requestId, REQUEST_STATES.SENT, { status: 'Checking the thread before I answer.' });
    setMood('curious');
    return;
  }
  if (event === 'sending') {
    requestManager.transition(requestId, REQUEST_STATES.SENT, { status: 'Sent to OpenClaw. Waiting for the run.' });
    setMood('focused');
    return;
  }
  if (event === 'run-started') {
    requestManager.transition(requestId, REQUEST_STATES.WAITING, { status: 'OpenClaw started working on it.' });
    setMood('focused');
    return;
  }
  if (event === 'history-polled') {
    requestManager.transition(requestId, REQUEST_STATES.WAITING, { status: 'Still attached. Checking for the latest reply.' });
    return;
  }
  if (event === 'run-event') {
    if (state === 'final' || shortText) {
      requestManager.transition(requestId, REQUEST_STATES.RESPONDING, {
        status: shortText || 'OpenClaw is finalizing the reply.',
      });
      setMood('speaking');
      return;
    }
    requestManager.transition(requestId, REQUEST_STATES.WAITING, {
      status: state ? `OpenClaw run event: ${state}.` : 'OpenClaw is still working.',
    });
    return;
  }
  if (event === 'assistant-final') {
    requestManager.transition(requestId, REQUEST_STATES.RESPONDING, {
      status: shortText || 'Reply received. Preparing speech.',
    });
    setMood('happy', 3600);
    return;
  }
  if (event === 'run-error' || event === 'run-aborted') {
    requestManager.transition(requestId, REQUEST_STATES.FAILED, {
      error: progress.error || 'OpenClaw stopped this run.',
    });
    setMood('concerned', 5000);
  }
}

function updateControlRail() {
  // Controls live in the tray menu; this hook remains so state transitions can
  // continue to call a single UI refresh point without rendering on-canvas buttons.
}

function updateDiagnosticsFromStatus(result, source = 'status') {
  if (!result?.ok) {
    requestManager.setDiagnostics({
      gateway: 'offline',
      lastEvent: `${source}: ${result?.error || 'failed'}`,
    });
    return;
  }
  const data = result.data || {};
  const model = data.model || data.current?.modelKey || config?.gateway?.model || 'unknown';
  const agent = data.defaultAgentId || config?.gateway?.sessionKey || 'main';
  const status = data.status || data.state || 'online';
  const detail = data.sessions != null ? `${status}, ${data.sessions} sessions` : status;
  requestManager.setDiagnostics({
    gateway: detail,
    agent,
    model,
    lastEvent: source,
  });
}

function handleGatewayStatus(result) {
  updateDiagnosticsFromStatus(result, result?.fromTray ? 'tray-status' : 'gateway-status');
  if (!result?.ok) {
    if (result?.fromTray) {
      if (activeQueryCount === 0) setState('error');
      if (activeQueryCount === 0) showSpeech(`Status failed: ${result.error}`, 4200);
      setTimeout(() => {
        if (activeQueryCount === 0) setState('idle');
      }, 900);
    }
    return;
  }
  const data = result.data || {};
  const summary = data.sessions != null
    ? `${data.status || 'online'} · ${data.sessions} sessions`
    : data.status || 'online';
  if (result.fromTray) {
    if (activeQueryCount === 0) {
      showSpeech(summary, 3200);
    } else {
      requestManager.setDiagnostics({ lastEvent: `status checked while ${activeQueryCount} request active` });
    }
    if (activeQueryCount === 0) {
      setState('idle');
    }
  }
}

const ttsEngine = new TtsEngine({
  config: {},
  animationEngine,
  onStart: () => {
    requestManager.setDiagnostics({ tts: 'speaking', lastEvent: 'tts-started' });
    setState('speaking');
  },
  onEnd: () => {
    requestManager.setDiagnostics({ tts: 'idle', lastEvent: 'tts-ended' });
    if (activeQueryCount > 0) {
      setState('thinking');
      return;
    }
    setState('idle');
    animationEngine.scheduleQuirk();
  },
  onError: () => {
    requestManager.setDiagnostics({ tts: 'error', lastEvent: 'tts-error' });
    setState('error');
    showSpeech('Speech failed.', 2800);
    setTimeout(() => {
      setState('idle');
      animationEngine.scheduleQuirk();
    }, 900);
  },
  onProgress: () => {},
});

const wakeWordEngine = new WakeWordEngine({
  config: {},
  listen: (options) => window.desktopClaw.listenNativeOnce(options),
  onWake: async (transcript) => {
    await captureVoiceCommand('wake', transcript);
  },
  onLog: (message, details = null) => {
    reportRuntimeIssue(message, details, 'info');
  },
});

function applyCursorReaction() {
  window.addEventListener('mousemove', (event) => {
    const rect = pet.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - cx, event.clientY - cy);
    pet.classList.toggle('cursor-near', distance < 180);

    // Pixel-level click-through: only capture events over actual interactive content.
    // The window starts as passthrough (setIgnoreMouseEvents true + forward:true), so
    // mousemove is always received even when the window ignores clicks.
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const overInteractive = !!el?.closest(
      '#pet, #interaction-shell, #speech-bubble, #settings-panel, .side-panel'
    );
    // Honour clickThroughWhenIdle: when idle with no overlays, make even the pet click-through.
    const composerOpen = !interactionShell.classList.contains('hidden');
    const settingsOpen = !settingsPanel.classList.contains('hidden');
    const historyOpen = !historyPanel.classList.contains('hidden');
    const diagnosticsOpen = !diagnosticsPanel.classList.contains('hidden');
    const idlePassthrough =
      config?.clickThroughWhenIdle && lastState === 'idle' && !composerOpen && !settingsOpen && !historyOpen && !diagnosticsOpen;
    window.desktopClaw?.setIgnoreMouse(!overInteractive || idlePassthrough);
  });

  petShell.addEventListener('mouseenter', () => {
    openComposer({ focus: false });
    cancelActivityTimers();
  });
  petShell.addEventListener('mouseleave', () => scheduleComposerClose());
  interactionShell.addEventListener('mouseenter', () => clearTimeout(composerHideTimer));
  interactionShell.addEventListener('mouseleave', () => scheduleComposerClose());
}

function applyConfig(nextConfig) {
  config = nextConfig;
  fields.availableVoices = getVoices();
  animationEngine.updateConfig(config);
  ttsEngine.updateConfig(config);
  wakeWordEngine.updateConfig(config);
  uiShell.bindSettings(config);
  requestManager.setDiagnostics({
    gateway: config?.gateway?.mode || 'unknown',
    agent: config?.gateway?.sessionKey || 'main',
    model: config?.gateway?.model || 'unknown',
    lastEvent: 'config-applied',
  });
  wakeWordEngine.stop();
  if (config.wakeWordEnabled) {
    wakeWordEngine.start();
  }
  setInteractiveMode(false);
  if (lastState === 'idle') {
    scheduleIdleActivity();
  }
}

async function speak(text) {
  if (config.mute) return;
  const plain = prepareSpeechText(text);
  await ttsEngine.speak(plain);
}

function stopSpeaking({ hideBubble = false, reason = 'user-interrupt' } = {}) {
  if (lastState !== 'speaking' && requestManager.diagnostics.tts !== 'speaking') return false;
  speechInterruptSerial += 1;
  ttsEngine.stop();
  uiShell.stopBubbleReveal();
  if (hideBubble) bubble.classList.add('hidden');
  requestManager.setDiagnostics({ tts: 'interrupted', lastEvent: reason });
  setState(activeQueryCount > 0 ? 'thinking' : 'idle');
  if (activeQueryCount === 0) {
    animationEngine.scheduleQuirk();
  }
  updateControlRail();
  return true;
}

function normalizeSpeechPunctuation(text) {
  return String(text || '')
    .replace(/\.{3,}/g, '... ')
    .replace(/([!?]){2,}/g, '$1 ')
    .replace(/([,;:])(?=\S)/g, '$1 ')
    .replace(/([.!?])(?=\S)/g, '$1 ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\(([^)]+)\)/g, ', $1, ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandSpeechAbbreviations(text) {
  return String(text || '')
    .replace(/\bOpenClaw\b/g, 'Open Claw')
    .replace(/\bURL\b/g, 'U R L')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bTTS\b/g, 'text to speech')
    .replace(/\bSTT\b/g, 'speech to text')
    .replace(/\bIPC\b/g, 'I P C')
    .replace(/\bOAuth\b/g, 'O auth')
    .replace(/\bUI\b/g, 'U I')
    .replace(/\bUX\b/g, 'U X')
    .replace(/\bHTTP\b/g, 'H T T P')
    .replace(/\bHTTPS\b/g, 'H T T P S')
    .replace(/\bWS\b/g, 'web socket');
}

function stripSpeechSymbols(text) {
  return String(text || '')
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, ' ')
    .replace(/[\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[\u{FE0E}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[•●■◆◇★☆]/g, ' ');
}

function prepareSpeechText(md) {
  let text = String(md || '').replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/https?:\/\/\S+/gi, 'a link');
  text = text.replace(/!\[[^\]]*\]\([^\)]*\)/g, '');
  text = text.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
  text = text.replace(/^#+\s+/gm, '');
  text = text.replace(/^>\s+/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');
  text = text.replace(/#\w+/g, '');
  text = stripSpeechSymbols(text);
  return normalizeSpeechPunctuation(expandSpeechAbbreviations(text));
}

async function submitQuery(text) {
  const message = String(text || '').trim();
  if (!message) return;

  composerPinned = false;
  textInput.value = '';
  interactionShell.classList.add('hidden');
  activeQueryCount += 1;
  setState('thinking');
  showSpeech('I am on it.', 1600);

  const requestId = requestManager.createRequest(message, { source: 'Chat' });
  requestManager.transition(requestId, REQUEST_STATES.SENT, { status: REQUEST_STATUS_TEXT[REQUEST_STATES.SENT] });
  requestManager.scheduleProgress(requestId);
  requestManager.setDiagnostics({ lastEvent: `query sent: ${requestManager.truncate(message, 50)}` });
  const unsubscribeProgress = openclawClient.onQueryProgress(requestId, (progress) => {
    handleQueryProgress(requestId, progress);
  });

  (async () => {
    try {
      const result = await openclawClient.sendQuery(message, { requestId });
      const request = requestManager.getRequest(requestId);
      const triage = classifyOpenClawResult(result, request);
      requestManager.setDiagnostics({ lastEvent: `triage: ${triage.type}` });

      if (requestManager.isCancelled(requestId) || triage.type === 'irrelevant_session_event') {
        return;
      }

      if (triage.type === 'assistant_final' || triage.type === 'needs_user_input') {
        requestManager.transition(requestId, REQUEST_STATES.RESPONDING, { status: REQUEST_STATUS_TEXT[REQUEST_STATES.RESPONDING] });
        requestManager.transition(requestId, REQUEST_STATES.COMPLETED, { response: triage.text });
        showSpeech(triage.text, 0);
        const speechSerial = speechInterruptSerial;
        await speak(triage.text);
        if (!requestManager.isCancelled(requestId) && speechSerial === speechInterruptSerial) {
          uiShell.finishBubbleReveal(triage.text, 9000);
        }
        if (config.mute) {
          setState('idle');
          animationEngine.scheduleQuirk();
        }
        return;
      }

      if (triage.type === 'gateway_status') {
        requestManager.transition(requestId, REQUEST_STATES.COMPLETED, {
          response: triage.text || 'Gateway status received.',
        });
        return;
      }

      if (triage.type === 'transient_error') {
        const shouldSurface = triage.display && activeQueryCount <= 1;
        requestManager.transition(requestId, REQUEST_STATES.FAILED, {
          error: triage.text || "I can't reach OpenClaw right now.",
        });
        setState('error');
        if (shouldSurface) {
          showSpeech(triage.text, 5200);
          await speak(triage.text);
        }
        setTimeout(() => {
          setState('idle');
          animationEngine.scheduleQuirk();
        }, 1000);
      }
    } catch (err) {
      if (requestManager.isCancelled(requestId)) return;
      requestManager.transition(requestId, REQUEST_STATES.FAILED, { error: err?.message || 'Unknown error' });
      setState('error');
      showSpeech('Request failed.', 5200);
      setTimeout(() => {
        if (activeQueryCount === 0) {
          setState('idle');
          animationEngine.scheduleQuirk();
        }
      }, 1000);
    } finally {
      unsubscribeProgress();
      requestManager.clearProgressTimers(requestId);
      activeQueryCount = Math.max(0, activeQueryCount - 1);
      requestManager.setDiagnostics({ activeRequests: requestManager.getActiveRequests().length });
      if (activeQueryCount > 0 && lastState !== 'speaking') {
        setState('thinking');
      } else if (activeQueryCount === 0 && lastState === 'thinking') {
        setState('idle');
        animationEngine.scheduleQuirk();
      }
      updateControlRail();
    }
  })();
}

function normalizePhrase(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (!aa) return bb.length;
  if (!bb) return aa.length;

  const dp = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
  for (let i = 0; i <= aa.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= bb.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[aa.length][bb.length];
}

function extractCommandFromWakeTranscript(transcript) {
  const normalizedWake = normalizePhrase(config?.wakeWord || '');
  const normalizedTranscript = normalizePhrase(transcript);
  if (!normalizedWake || !normalizedTranscript) return '';

  if (normalizedTranscript.startsWith(`${normalizedWake} `)) {
    return normalizedTranscript.slice(normalizedWake.length).trim();
  }

  const wakeTokens = normalizedWake.split(' ').filter(Boolean);
  const heardTokens = normalizedTranscript.split(' ').filter(Boolean);
  if (wakeTokens.length < 2 || heardTokens.length < 3) return '';

  const wakeNameToken = wakeTokens[wakeTokens.length - 1];
  const heardNameToken = heardTokens[1];
  const firstTokenIsWakeStart = heardTokens[0].length <= 4;
  const isLikelyWakePrefix = firstTokenIsWakeStart && editDistance(wakeNameToken, heardNameToken) <= 2;

  if (isLikelyWakePrefix) {
    return heardTokens.slice(2).join(' ').trim();
  }

  return '';
}

async function captureVoiceCommand(source = 'wake', wakeTranscript = '') {
  if (voiceCaptureInFlight) return;
  voiceCaptureInFlight = true;

  const shouldResumeWake = !!config?.wakeWordEnabled;
  let listeningCueStarted = false;
  wakeWordEngine.stop();

  try {
    setState('listening');
    openComposer({ focus: false, clear: true });

    const inlineCommand = extractCommandFromWakeTranscript(wakeTranscript);
    if (inlineCommand) {
      showSpeech('Working on it...', 1200);
      textInput.value = inlineCommand;
      await submitQuery(inlineCommand);
      return;
    }

    showSpeech(source === 'wake' ? 'Yes? I am listening.' : 'Listening...', 2200);
    audioCuePlayer.play('start');
    listeningCueStarted = true;

    const result = await window.desktopClaw.listenNativeOnce({
      timeoutSeconds: 8,
      silenceSeconds: 2,
    });
    audioCuePlayer.play('stop');
    listeningCueStarted = false;

    const transcript = String(result?.text || '').trim();
    if (!result?.ok || !transcript) {
      showSpeech("I didn't catch that.", 1800);
      setState('idle');
      return;
    }

    const normalizedWake = normalizePhrase(config?.wakeWord || '');
    const normalizedTranscript = normalizePhrase(transcript);
    if (normalizedWake && normalizedTranscript === normalizedWake) {
      showSpeech('Tell me what you need.', 2200);
      setState('idle');
      return;
    }

    textInput.value = transcript;
    await submitQuery(transcript);
  } catch (error) {
    reportRuntimeIssue('Voice command capture failed', {
      source,
      message: error?.message || String(error),
    });
    showSpeech('Voice capture failed.', 2400);
    setState('error');
    setTimeout(() => {
      setState('idle');
      animationEngine.scheduleQuirk();
    }, 900);
  } finally {
    if (listeningCueStarted) {
      audioCuePlayer.play('stop');
    }
    voiceCaptureInFlight = false;
    if (shouldResumeWake) {
      wakeWordEngine.start();
    }
  }
}

async function saveSettingsForm() {
  try {
    const nextConfig = uiShell.collectSettings(config);
    applyConfig(await window.desktopClaw.setConfig(nextConfig));
    showSpeech('Settings saved.', 2200);
  } catch (error) {
    setState('error');
    showSpeech(error.message || 'Failed to save settings.', 4000);
    setTimeout(() => {
      setState('idle');
      animationEngine.scheduleQuirk();
    }, 900);
  }
}

async function checkStatus() {
  if (activeQueryCount === 0) setState('thinking');
  const status = await openclawClient.getStatus();
  handleGatewayStatus(status);
  if (!status.ok) {
    if (activeQueryCount === 0) setState('error');
    if (activeQueryCount === 0) showSpeech(`Status failed: ${status.error}`, 4200);
    setTimeout(() => {
      if (activeQueryCount === 0) setState('idle');
    }, 900);
    return;
  }
  const sessions = status.data?.sessions;
  const summary = sessions != null ? `Gateway online. ${sessions} active sessions.` : 'Gateway online.';
  if (activeQueryCount === 0) {
    showSpeech(summary, 3200);
  } else {
    requestManager.setDiagnostics({ lastEvent: `gateway checked during active request: ${summary}` });
  }
  if (activeQueryCount === 0) setState('idle');
}

function installDragging() {
  pet.addEventListener('pointerdown', (event) => {
    if (event.detail >= 2 && stopSpeaking({ hideBubble: true, reason: 'avatar-double-click' })) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setInteractiveMode(true);
    dragState = { x: event.screenX, y: event.screenY };
    dragMoved = false;
    pet.classList.add('dragging');
    cancelActivityTimers();
  });

  pet.addEventListener('dblclick', (event) => {
    if (stopSpeaking({ hideBubble: true, reason: 'avatar-double-click' })) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('pointermove', (event) => {
    if (!dragState) return;
    const delta = { x: event.screenX - dragState.x, y: event.screenY - dragState.y };
    if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) {
      dragMoved = true;
    }
    dragState = { x: event.screenX, y: event.screenY };
    window.desktopClaw.dragWindow(delta);
  });

  window.addEventListener('pointerup', () => {
    const shouldFocusComposer = Boolean(dragState) && !dragMoved;
    dragState = null;
    pet.classList.remove('dragging');
    setInteractiveMode(false);
    if (shouldFocusComposer) {
      openComposer({ focus: true, clear: false });
    } else if (lastState === 'idle') {
      scheduleIdleActivity();
    }
  });
}

function attachOptionalAudioHook() {
  if (typeof window.desktopClaw?.onAudioActive !== 'function') {
    reportRuntimeIssue('Audio activity hook not available. Music mode will stay inactive until preload/main process exposes onAudioActive.', null, 'info');
    return;
  }

  window.desktopClaw.onAudioActive((active) => {
    clearTimeout(audioDebounceTimer);
    audioDebounceTimer = setTimeout(() => {
      audioIsActive = !!active;
      if (audioIsActive) {
        beginActivity('music', 'audio');
      } else if (currentActivity === 'music') {
        endActivity();
      }
    }, active ? 120 : 800);
  });
}

window.desktopClaw.onShortcutListen(() => {
  openComposer({ focus: true, clear: false });
  showSpeech('Type to me.', 1400);
});
window.desktopClaw.onShortcutStatus(() => checkStatus());
window.desktopClaw.onGatewayStatus?.((status) => handleGatewayStatus(status));
window.desktopClaw.onSettingsOpen(() => {
  setInteractiveMode(true);
  uiShell.toggleSettings(true);
  requestManager.setDiagnostics({ lastEvent: 'settings-opened' });
  cancelActivityTimers();
});
window.desktopClaw.onConfigUpdated((nextConfig) => applyConfig(nextConfig));

function hideCurrentReply() {
  uiShell.stopBubbleReveal();
  bubble.classList.add('hidden');
  updateControlRail();
}

function cancelVisibleActiveRequests() {
  const count = requestManager.cancelActive();
  if (count > 0) {
    stopSpeaking({ hideBubble: true, reason: 'tray-cancel-active' });
    setState('idle');
    showSpeech('Cancelled visible active work. Late replies will be ignored.', 2600);
  }
}

function showHistoryPanel() {
  historyPanel.classList.remove('hidden');
  diagnosticsPanel.classList.add('hidden');
  setInteractiveMode(!historyPanel.classList.contains('hidden'));
  requestManager.renderHistory();
}

function showDiagnosticsPanel() {
  diagnosticsPanel.classList.remove('hidden');
  historyPanel.classList.add('hidden');
  setInteractiveMode(!diagnosticsPanel.classList.contains('hidden'));
  requestManager.renderDiagnostics();
}

window.desktopClaw.onTrayCommand?.((command) => {
  switch (command) {
    case 'stop-speaking':
      stopSpeaking({ hideBubble: false, reason: 'tray-stop-speaking' });
      break;
    case 'hide-reply':
      hideCurrentReply();
      break;
    case 'cancel-active':
      cancelVisibleActiveRequests();
      break;
    case 'show-history':
      showHistoryPanel();
      break;
    case 'show-diagnostics':
      showDiagnosticsPanel();
      break;
    default:
      break;
  }
});

historyClose?.addEventListener('click', () => {
  historyPanel.classList.add('hidden');
  setInteractiveMode(false);
});

diagnosticsClose?.addEventListener('click', () => {
  diagnosticsPanel.classList.add('hidden');
  setInteractiveMode(false);
});

textInput.addEventListener('focus', () => {
  composerPinned = true;
  clearTimeout(composerHideTimer);
  setInteractiveMode(true);
  cancelActivityTimers();
});

textInput.addEventListener('blur', () => {
  composerPinned = false;
  scheduleComposerClose(180);
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitQuery(textInput.value);
  }

  if (event.key === 'Escape') {
    textInput.value = '';
    composerPinned = false;
    closeComposer(true);
  }
});

closeSettings.addEventListener('click', () => {
  uiShell.toggleSettings(false);
  setInteractiveMode(false);
  if (lastState === 'idle') scheduleIdleActivity();
});
saveSettings.addEventListener('click', () => saveSettingsForm());
testStatus.addEventListener('click', () => checkStatus());

(async function init() {
  const logPath = await window.desktopClaw.getLogPath();
  reportRuntimeIssue('Renderer initialized', { logPath }, 'info');
  applyConfig(await window.desktopClaw.getConfig());
  installDragging();
  applyCursorReaction();
  attachOptionalAudioHook();
  requestManager.renderHistory();
  requestManager.renderDiagnostics();
  setState('idle');
  animationEngine.scheduleQuirk();
  scheduleIdleActivity();
  showSpeech('DesktopClaw ready.', 1800);
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      fields.availableVoices = getVoices();
      uiShell.bindSettings(config);
    };
  }
})();
