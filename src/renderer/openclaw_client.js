export class RendererOpenClawClient {
  async sendQuery(text, options = {}) {
    if (options.requestId && typeof window.desktopClaw.sendQueryStream === 'function') {
      return window.desktopClaw.sendQueryStream({
        text,
        requestId: options.requestId,
      });
    }
    return window.desktopClaw.sendQuery(text);
  }

  onQueryProgress(requestId, callback) {
    if (!requestId || typeof window.desktopClaw.onQueryProgress !== 'function') {
      return () => {};
    }
    return window.desktopClaw.onQueryProgress(requestId, callback);
  }

  async getStatus() {
    return window.desktopClaw.getStatus();
  }
}
