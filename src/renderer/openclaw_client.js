export class RendererOpenClawClient {
  async sendQuery(text) {
    return window.desktopClaw.sendQuery(text);
  }

  async getStatus() {
    return window.desktopClaw.getStatus();
  }
}
