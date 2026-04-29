export class TtsEngine {
  constructor({ config, animationEngine, onStart, onEnd, onError, onProgress }) {
    this.config = config;
    this.animationEngine = animationEngine;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.onProgress = onProgress;
    this.currentAudio = null;
    this.currentObjectUrl = null;
    this.cancelled = false;
    this.runId = 0;
  }

  updateConfig(config) {
    this.config = config;
  }

  setAudioActive(active) {
    const promise = window.desktopClaw?.setAudioActive?.(active);
    if (promise?.catch) promise.catch(() => {});
  }

  async speak(text) {
    if (this.config.mute) return;
    this.stop({ notify: false });
    this.cancelled = false;
    const runId = ++this.runId;

    if (this.config.tts?.usePiperTts) {
      return this._speakPiper(text);
    }

    if (!this.config.tts?.useSystemTts) return;

    // Web Speech API fallback
    const synth = window.speechSynthesis;
    synth.cancel();
    const value = String(text || '');
    const utterance = new SpeechSynthesisUtterance(value);
    const voices = synth.getVoices();
    const voice = voices.find((entry) => entry.name === this.config.tts.voiceName);
    if (voice) utterance.voice = voice;
    utterance.rate = this.config.tts.rate;
    utterance.pitch = this.config.tts.pitch;
    utterance.volume = this.config.volume;

    this.onStart?.();
    this.setAudioActive(true);
    this.animationEngine.animateSpeechText(value);

    let fallbackTimer = null;
    let progressIndex = 0;
    const totalChars = value.length;
    const msPerChar = Math.max(22, Math.round(52 / Math.max(utterance.rate || 1, 0.4)));

    const pushProgress = (nextIndex) => {
      if (runId !== this.runId || this.cancelled) return;
      progressIndex = Math.max(progressIndex, Math.min(nextIndex, totalChars));
      this.onProgress?.(value.slice(0, progressIndex), progressIndex >= totalChars);
    };

    utterance.onboundary = (event) => {
      if (typeof event.charIndex === 'number') {
        pushProgress(event.charIndex + 1);
      }
    };

    fallbackTimer = setInterval(() => {
      if (progressIndex >= totalChars) return;
      pushProgress(progressIndex + 1);
    }, msPerChar);

    await new Promise((resolve, reject) => {
      utterance.onend = resolve;
      utterance.onerror = reject;
      synth.speak(utterance);
    }).then(
      () => {
        clearInterval(fallbackTimer);
        pushProgress(totalChars);
        this.animationEngine.stopSpeechAnimation();
        this.setAudioActive(false);
        if (runId === this.runId && !this.cancelled) this.onEnd?.();
      },
      () => {
        clearInterval(fallbackTimer);
        this.animationEngine.stopSpeechAnimation();
        this.setAudioActive(false);
        if (runId === this.runId && !this.cancelled) this.onError?.();
      },
    );
  }

  async _speakPiper(text) {
    const runId = this.runId;
    const value = String(text || '');
    this.onStart?.();
    this.setAudioActive(true);
    this.animationEngine.animateSpeechText(value);

    try {
      const result = await window.desktopClaw.speakPiper(value);

      if (!result?.ok) {
        // TTS failed but response is valid — log and continue silently
        console.warn('[TtsEngine] Piper synthesis failed:', result?.error);
        return;
      }

      if (runId !== this.runId || this.cancelled) {
        return;
      }

      const blob = new Blob([result.buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      this.currentObjectUrl = url;
      const audio = new Audio(url);
      this.currentAudio = audio;

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = (e) => {
          console.warn('[TtsEngine] Piper audio playback error', e);
          resolve();
        };
        audio.play().catch((e) => {
          console.warn('[TtsEngine] Piper audio play() rejected', e);
          resolve();
        });
      });

      if (this.currentObjectUrl === url) {
        URL.revokeObjectURL(url);
        this.currentObjectUrl = null;
      }
    } finally {
      this.currentAudio = null;
      this.animationEngine.stopSpeechAnimation();
      this.setAudioActive(false);
      if (runId === this.runId && !this.cancelled) this.onEnd?.();
    }
  }

  stop({ notify = true } = {}) {
    this.cancelled = true;
    this.runId += 1;
    window.speechSynthesis?.cancel?.();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio.src = '';
      this.currentAudio.load();
      this.currentAudio = null;
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.animationEngine.stopSpeechAnimation();
    this.setAudioActive(false);
    if (notify) this.onEnd?.();
  }
}
