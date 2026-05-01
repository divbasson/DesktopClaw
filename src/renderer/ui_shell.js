function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

export class RendererUiShell {
  constructor({ bubble, settingsPanel, fields }) {
    this.bubble = bubble;
    this.settingsPanel = settingsPanel;
    this.fields = fields;
    this._revealTimer = null;
    this._bubbleTimer = null;
  }

  setBubble(text, timeoutMs = 8000) {
    this.stopBubbleReveal();
    this.bubble.innerHTML = renderMarkdown(text);
    this.bubble.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.bubble.scrollTop = this.bubble.scrollHeight;
    });
    clearTimeout(this._bubbleTimer);
    if (timeoutMs > 0) {
      this._bubbleTimer = setTimeout(() => this.bubble.classList.add('hidden'), timeoutMs);
    }
  }

  startBubbleReveal(text, durationMs = 3200) {
    this.stopBubbleReveal();
    const value = String(text || '');
    this.bubble.textContent = '';
    this.bubble.classList.remove('hidden');
    clearTimeout(this._bubbleTimer);

    if (!value) return;

    const totalChars = value.length;
    const frameMs = Math.max(18, Math.min(70, Math.round(durationMs / Math.max(totalChars, 1))));
    let index = 0;

    const tick = () => {
      index = Math.min(index + 1, totalChars);
      this.bubble.textContent = value.slice(0, index);
      this.bubble.scrollTop = this.bubble.scrollHeight;
      if (index < totalChars) {
        this._revealTimer = setTimeout(tick, frameMs);
      } else {
        this._revealTimer = null;
      }
    };

    tick();
  }

  setBubbleText(text) {
    this.bubble.classList.remove('hidden');
    this.bubble.textContent = String(text || '');
    this.bubble.scrollTop = this.bubble.scrollHeight;
  }

  finishBubbleReveal(text, timeoutMs = 8000) {
    this.stopBubbleReveal();
    this.bubble.innerHTML = renderMarkdown(text);
    this.bubble.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.bubble.scrollTop = this.bubble.scrollHeight;
    });
    clearTimeout(this._bubbleTimer);
    if (timeoutMs > 0) {
      this._bubbleTimer = setTimeout(() => this.bubble.classList.add('hidden'), timeoutMs);
    }
  }

  stopBubbleReveal() {
    clearTimeout(this._revealTimer);
    this._revealTimer = null;
  }

  toggleSettings(force) {
    const show = typeof force === 'boolean' ? force : this.settingsPanel.classList.contains('hidden');
    this.settingsPanel.classList.toggle('hidden', !show);
  }

  bindSettings(config) {
    const gatewayMode = config.gateway.mode === 'http' ? 'gateway' : config.gateway.mode;
    this.fields.wakeWord.value = config.wakeWord;
    this.fields.wakeWordEnabled.checked = !!config.wakeWordEnabled;
    this.fields.alwaysOnTop.checked = config.alwaysOnTop;
    this.fields.mute.checked = config.mute;
    this.fields.volume.value = config.volume;
    this.fields.voiceName.innerHTML = '';
    (this.fields.availableVoices || []).forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}`;
      this.fields.voiceName.appendChild(option);
    });
    if (!this.fields.voiceName.querySelector('option[value=""]')) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'System default';
      this.fields.voiceName.prepend(option);
    }
    this.fields.voiceName.value = config.tts.voiceName || '';
    this.fields.clickThroughWhenIdle.checked = !!config.clickThroughWhenIdle;
    this.fields.pollEnabled.checked = !!config.status.pollEnabled;
    this.fields.pollIntervalMs.value = config.status.pollIntervalMs;
    this.fields.speakNotifications.checked = !!config.status.speakNotifications;
    this.fields.showNotifications.checked = !!config.status.showNotifications;
    this.fields.gatewayMode.value = gatewayMode;
    this.fields.gatewayUrl.value = config.gateway.baseUrl;
    this.fields.gatewayChatPath.value = config.gateway.sessionKey || config.gateway.chatPath || 'main';
    this.fields.gatewayStatusPath.value = config.gateway.statusMethod || config.gateway.statusPath || 'health';
    this.fields.gatewayEventsUrl.value = config.gateway.eventsUrl || config.gateway.baseUrl || '';
    this.fields.gatewayEventsEnabled.checked = !!config.gateway.eventsEnabled;
    this.fields.gatewayToken.value = config.gateway.token;
    this.fields.gatewayPassword.value = config.gateway.password || '';
    this.fields.hotkeyListen.value = config.globalHotkeys.listen;
  }

  collectSettings(config) {
    const nextConfig = structuredClone(config);
    nextConfig.wakeWord = this.fields.wakeWord.value.trim();
    nextConfig.wakeWordEnabled = this.fields.wakeWordEnabled.checked;
    nextConfig.alwaysOnTop = this.fields.alwaysOnTop.checked;
    nextConfig.mute = this.fields.mute.checked;
    nextConfig.volume = Number(this.fields.volume.value);
    nextConfig.tts.voiceName = this.fields.voiceName.value;
    nextConfig.clickThroughWhenIdle = this.fields.clickThroughWhenIdle.checked;
    nextConfig.status.pollEnabled = this.fields.pollEnabled.checked;
    nextConfig.status.pollIntervalMs = Number(this.fields.pollIntervalMs.value) || 30000;
    nextConfig.status.speakNotifications = this.fields.speakNotifications.checked;
    nextConfig.status.showNotifications = this.fields.showNotifications.checked;
    nextConfig.gateway.mode = this.fields.gatewayMode.value;
    nextConfig.gateway.baseUrl = this.fields.gatewayUrl.value.trim();
    nextConfig.gateway.sessionKey = this.fields.gatewayChatPath.value.trim() || 'main';
    nextConfig.gateway.statusMethod = this.fields.gatewayStatusPath.value.trim() || 'health';
    nextConfig.gateway.chatPath = '';
    nextConfig.gateway.statusPath = '';
    nextConfig.gateway.eventsUrl = this.fields.gatewayEventsUrl.value.trim() || nextConfig.gateway.baseUrl;
    nextConfig.gateway.eventsEnabled = this.fields.gatewayEventsEnabled.checked;
    nextConfig.gateway.token = this.fields.gatewayToken.value;
    nextConfig.gateway.password = this.fields.gatewayPassword.value;
    nextConfig.globalHotkeys.listen = this.fields.hotkeyListen.value.trim();
    return nextConfig;
  }
}
