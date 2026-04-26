export class TtsEngine {
  constructor({ config, animationEngine, onStart, onEnd, onError, onProgress }) {
    this.config = config;
    this.animationEngine = animationEngine;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.onProgress = onProgress;
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
        this.onEnd?.();
      },
      () => {
        clearInterval(fallbackTimer);
        this.animationEngine.stopSpeechAnimation();
        this.setAudioActive(false);
        this.onError?.();
      },
    );
  }

  async _speakPiper(text) {
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

      const blob = new Blob([result.buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

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

      URL.revokeObjectURL(url);
    } finally {
      this.animationEngine.stopSpeechAnimation();
      this.setAudioActive(false);
      this.onEnd?.();
    }
  }
}
