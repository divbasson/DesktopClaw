export class StatusMonitor {
  constructor({ client, onStatus, onChange, onError }) {
    this.client = client;
    this.onStatus = onStatus;
    this.onChange = onChange;
    this.onError = onError;
    this.config = { status: { pollEnabled: false, pollIntervalMs: 30000 } };
    this.timer = null;
    this.lastFingerprint = null;
    this.failureCount = 0;
  }

  updateConfig(config) {
    this.config = config;
    this.restart();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  restart() {
    this.stop();
    this.failureCount = 0;
    if (!this.config?.status?.pollEnabled) return;
    this.schedule(400);
  }

  schedule(delay = this.config?.status?.pollIntervalMs || 30000) {
    this.stop();
    this.timer = setTimeout(() => this.tick(), delay);
  }

  async tick() {
    let result;
    try {
      result = await this.client.getStatus();
    } catch (error) {
      this.failureCount += 1;
      this.onError?.(error?.message || 'Gateway status request failed');
      const base = this.config?.status?.pollIntervalMs || 30000;
      const penalty = Math.min(base * 2, 5000 * this.failureCount);
      const jitter = Math.floor(Math.random() * 250);
      return this.schedule(base + penalty + jitter);
    }

    if (!result.ok) {
      this.failureCount += 1;
      this.onError?.(result.error);
      const base = this.config?.status?.pollIntervalMs || 30000;
      const penalty = Math.min(base * 2, 5000 * this.failureCount);
      const jitter = Math.floor(Math.random() * 250);
      return this.schedule(base + penalty + jitter);
    }

    const data = result.data || {};
    const fingerprint = JSON.stringify(data);
    this.onStatus?.(data);
    if (this.lastFingerprint && this.lastFingerprint !== fingerprint) {
      this.onChange?.(data);
    }
    this.lastFingerprint = fingerprint;
    this.failureCount = 0;
    this.schedule();
  }
}
