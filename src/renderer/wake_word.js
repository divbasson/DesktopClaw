export class WakeWordEngine {
  constructor({ config, listen, onWake, onLog }) {
    this.config = config;
    this.listen = listen;
    this.onWake = onWake;
    this.onLog = onLog;
    this.enabled = false;
    this.running = false;
    this.cooldownUntil = 0;
  }

  updateConfig(config) {
    this.config = config;
    if (this.enabled && !this.running) {
      this.start();
    }
  }

  isSupported() {
    return typeof this.listen === 'function';
  }

  start() {
    if (!this.config?.wakeWordEnabled || !this.isSupported() || this.enabled) return false;
    this.enabled = true;
    this.loop();
    return true;
  }

  stop() {
    this.enabled = false;
  }

  normalizeToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  editDistance(a, b) {
    const aa = this.normalizeToken(a);
    const bb = this.normalizeToken(b);
    if (!aa) return bb.length;
    if (!bb) return aa.length;

    const dp = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
    for (let i = 0; i <= aa.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= bb.length; j += 1) dp[0][j] = j;

    for (let i = 1; i <= aa.length; i += 1) {
      for (let j = 1; j <= bb.length; j += 1) {
        const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[aa.length][bb.length];
  }

  tokenMatches(wakeToken, transcriptToken) {
    const wake = this.normalizeToken(wakeToken);
    const heard = this.normalizeToken(transcriptToken);
    if (!wake || !heard) return false;
    if (wake === heard) return true;

    // Accept close variants from ASR (e.g. claw -> clue / kla).
    if (wake.length >= 4 && this.editDistance(wake, heard) <= 2) return true;
    if (wake.length >= 3 && this.editDistance(wake, heard) <= 1) return true;

    return false;
  }

  async loop() {
    if (this.running) return;
    this.running = true;

    while (this.enabled) {
      try {
        const result = await this.listen({
          timeoutSeconds: 3.2,
          silenceSeconds: 0.7,
        });

        const transcript = String(result?.text || '').trim().toLowerCase();
        const wakeWord = String(this.config?.wakeWord || '').trim().toLowerCase();
        const now = Date.now();

        if (wakeWord && transcript && now >= this.cooldownUntil) {
          // Token + fuzzy matching: Vosk often mishears lead/final sounds.
          const wakeTokens = wakeWord.split(/\s+/).filter(Boolean);
          const transcriptTokens = transcript.split(/\s+/).filter(Boolean);
          const hit = wakeTokens.some(
            (wakeToken) => wakeToken.length > 2 && transcriptTokens.some((heard) => this.tokenMatches(wakeToken, heard)),
          );

          if (hit) {
            this.cooldownUntil = now + 4000;
            this.onLog?.('Wake word detected', { transcript, wakeWord });
            await Promise.resolve(this.onWake?.(transcript));
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
      } catch (error) {
        const message = String(error?.message || error || '');
        const ignorable = /no speech detected before timeout/i.test(message);
        if (!ignorable) {
          this.onLog?.('Wake word listener error', { message });
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }

    this.running = false;
  }
}
