const path = require('node:path');
const { Menu, Tray, nativeImage, app } = require('electron');

class TrayManager {
  constructor(handlers) {
    this.handlers = handlers;
    this.tray = null;
  }

  create(config) {
    if (this.tray) return this.tray;
    const iconPath = path.join(__dirname, '..', 'assets', 'openclaw.ico');
    const fallback = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0p8AAAAASUVORK5CYII=');
    const icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(icon.isEmpty() ? fallback : icon);
    this.tray.setToolTip('DesktopClaw');
    this.setMenu(config);
    this.tray.on('double-click', () => this.handlers.onToggleVisibility?.());
    return this.tray;
  }

  setMenu(config) {
    if (!this.tray) return;
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide Pet', click: () => this.handlers.onToggleVisibility?.() },
      { label: 'Open Prompt', click: () => this.handlers.onListen?.() },
      { label: config.mute ? 'Unmute' : 'Mute', click: () => this.handlers.onToggleMute?.() },
      { type: 'separator' },
      { label: 'Open Settings', click: () => this.handlers.onOpenSettings?.() },
      { label: 'Check Status', click: () => this.handlers.onCheckStatus?.() },
      { type: 'separator' },
      { label: 'Quit DesktopClaw', click: () => { this.handlers.onQuit?.(); app.quit(); } },
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}

module.exports = { TrayManager };
