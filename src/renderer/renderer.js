import { AnimationEngine } from './animation_engine.js';
import { TtsEngine } from './tts_engine.js';
import { WakeWordEngine } from './wake_word.js';
import { RendererOpenClawClient } from './openclaw_client.js';
import { RendererUiShell } from './ui_shell.js';

const app = document.getElementById('app');
const pet = document.getElementById('pet');
const petShell = document.getElementById('pet-shell');
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

let config;
let dragState = null;
let lastState = 'idle';
let composerPinned = false;
let composerHideTimer = null;
let dragMoved = false;
let voiceCaptureInFlight = false;

const animationEngine = new AnimationEngine({ app, mouth, config: { idle: { quirkMinSeconds: 10, quirkMaxSeconds: 30 } } });
const uiShell = new RendererUiShell({ bubble, settingsPanel, fields });
const openclawClient = new RendererOpenClawClient();

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

function setInteractiveMode(enabled) {
  if (!config?.clickThroughWhenIdle) {
    window.desktopClaw.setIgnoreMouse(false);
    return;
  }
  const shouldIgnore = !enabled && lastState === 'idle';
  window.desktopClaw.setIgnoreMouse(shouldIgnore);
}

function setState(state) {
  lastState = state;
  animationEngine.setState(state);
  const composerVisible = !interactionShell.classList.contains('hidden');
  const settingsVisible = !settingsPanel.classList.contains('hidden');
  setInteractiveMode(state !== 'idle' || composerVisible || settingsVisible || !config?.clickThroughWhenIdle);
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
}

function scheduleComposerClose(delay = 300) {
  clearTimeout(composerHideTimer);
  composerHideTimer = setTimeout(() => closeComposer(false), delay);
}

function showSpeech(text, timeoutMs = 8000) {
  uiShell.setBubble(text, timeoutMs);
}

const ttsEngine = new TtsEngine({
  config: {},
  animationEngine,
  onStart: () => setState('speaking'),
  onEnd: () => {
    setState('idle');
    animationEngine.scheduleQuirk();
  },
  onError: () => {
    setState('error');
    showSpeech('Speech failed.', 2800);
    setTimeout(() => {
      setState('idle');
      animationEngine.scheduleQuirk();
    }, 900);
  },
  onProgress: () => {
    // Bubble is rendered upfront; no char-by-char overlay needed
  },
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
  });

  petShell.addEventListener('mouseenter', () => openComposer({ focus: false }));
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
  wakeWordEngine.stop();
  if (config.wakeWordEnabled) {
    wakeWordEngine.start();
  }
  setInteractiveMode(false);
}

async function speak(text) {
  if (config.mute) return;
  await ttsEngine.speak(text);
}

async function submitQuery(text) {
  const message = String(text || '').trim();
  if (!message) return;

  composerPinned = false;
  textInput.value = '';
  interactionShell.classList.add('hidden');
  setState('thinking');
  showSpeech('...', 0);

  const result = await openclawClient.sendQuery(message);
  if (!result.ok) {
    setState('error');
    const fallback = result.error || "I can't reach OpenClaw right now.";
    showSpeech(fallback, 5200);
    await speak(fallback);
    setTimeout(() => {
      setState('idle');
      animationEngine.scheduleQuirk();
    }, 1000);
    return;
  }

  // Render markdown immediately so it's visible while TTS loads/plays
  showSpeech(result.text, 0);
  await speak(result.text);
  // Set auto-hide timeout and ensure idle state (onEnd handles it when TTS active;
  // when muted or no TTS configured, we handle it here)
  uiShell.finishBubbleReveal(result.text, 9000);
  if (config.mute) {
    setState('idle');
    animationEngine.scheduleQuirk();
  }
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
  // Accept any short first token (≤4 chars) as a potential mis-transcription of 'hey'/'hi'/'ok'
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

    const result = await window.desktopClaw.listenNativeOnce({
      timeoutSeconds: 6,
      silenceSeconds: 1,
    });

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
  setState('thinking');
  const status = await openclawClient.getStatus();
  if (!status.ok) {
    setState('error');
    showSpeech(`Status failed: ${status.error}`, 4200);
    setTimeout(() => setState('idle'), 900);
    return;
  }
  const sessions = status.data?.sessions;
  const summary = sessions != null ? `Gateway online. ${sessions} active sessions.` : 'Gateway online.';
  showSpeech(summary, 3200);
  setState('idle');
}

function installDragging() {
  pet.addEventListener('pointerdown', (event) => {
    setInteractiveMode(true);
    dragState = { x: event.screenX, y: event.screenY };
    dragMoved = false;
    pet.classList.add('dragging');
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
    }
  });
}

window.desktopClaw.onShortcutListen(() => {
  captureVoiceCommand('hotkey');
});
window.desktopClaw.onShortcutStatus(() => checkStatus());
window.desktopClaw.onSettingsOpen(() => {
  setInteractiveMode(true);
  uiShell.toggleSettings(true);
});
window.desktopClaw.onConfigUpdated((nextConfig) => applyConfig(nextConfig));

textInput.addEventListener('focus', () => {
  composerPinned = true;
  clearTimeout(composerHideTimer);
  setInteractiveMode(true);
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
});
saveSettings.addEventListener('click', () => saveSettingsForm());
testStatus.addEventListener('click', () => checkStatus());

(async function init() {
  const logPath = await window.desktopClaw.getLogPath();
  reportRuntimeIssue('Renderer initialized', { logPath }, 'info');
  applyConfig(await window.desktopClaw.getConfig());
  installDragging();
  applyCursorReaction();
  setState('idle');
  animationEngine.scheduleQuirk();
  showSpeech('DesktopClaw ready.', 1800);
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      fields.availableVoices = getVoices();
      uiShell.bindSettings(config);
    };
  }
})();
