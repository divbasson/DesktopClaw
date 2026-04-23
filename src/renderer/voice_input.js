export class VoiceInput {
  constructor({ onTranscript, onError, onStart, onEnd, onLog }) {
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onLog = onLog;
    this.recognition = null;
  }

  isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async ensureMicrophoneReady() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onLog?.('Microphone API unavailable', {
        hasMediaDevices: Boolean(navigator.mediaDevices),
        hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      });
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    this.onLog?.('Microphone access granted');
    return true;
  }

  async listenOnce() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.onLog?.('Speech recognition unavailable', {
        hasSpeechRecognition: Boolean(window.SpeechRecognition),
        hasWebkitSpeechRecognition: Boolean(window.webkitSpeechRecognition),
      });
      this.onError?.(new Error('Speech recognition unavailable'), {
        phase: 'support-check',
        code: 'unavailable',
      });
      return false;
    }

    try {
      await this.ensureMicrophoneReady();
    } catch (error) {
      this.onLog?.('Microphone permission failed', {
        name: error?.name,
        message: error?.message,
      });
      this.onError?.(new Error(error?.message || 'Microphone permission failed'), {
        phase: 'microphone',
        code: error?.name || 'microphone-failed',
      });
      return false;
    }

    this.recognition?.abort();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => this.onStart?.();
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      this.onTranscript?.(transcript);
    };
    recognition.onerror = (event) => {
      this.onLog?.('Speech recognition error', {
        error: event?.error,
        message: event?.message,
      });
      this.onError?.(new Error(event?.error || 'Mic or speech recognition failed'), {
        phase: 'speech-recognition',
        code: event?.error || 'unknown',
        message: event?.message || '',
      });
    };
    recognition.onend = () => this.onEnd?.();

    this.recognition = recognition;
    recognition.start();
    this.onLog?.('Speech recognition started');
    return true;
  }
}
