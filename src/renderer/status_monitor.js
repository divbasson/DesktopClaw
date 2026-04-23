export class StatusMonitor {
  constructor({ client, onStatus, onChange, onError }) {
    this.client = client;
    this.onStatus = onStatus;
    this.onChange = onChange;
    this.onError = onError;
    this.config = { status: { pollEnabled: false, pollIntervalMs: 30000 } };
    this.timer = null;
    this.lastFingerprint = null;
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
    if (!this.config?.status?.pollEnabled) return;
    this.schedule(400);
  }

  schedule(delay = this.config?.status?.pollIntervalMs || 30000) {
    this.stop();
    this.timer = setTimeout(() => this.tick(), delay);
  }

  async tick() {
    const result = await this.client.getStatus();
    if (!result.ok) {
      this.onError?.(result.error);
      return this.schedule();
    }

    const data = result.data || {};
    const fingerprint = JSON.stringify(data);
    this.onStatus?.(data);
    if (this.lastFingerprint && this.lastFingerprint !== fingerprint) {
      this.onChange?.(data);
    }
    this.lastFingerprint = fingerprint;
    this.schedule();
  }
}
