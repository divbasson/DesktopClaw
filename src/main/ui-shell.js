const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { logError, logInfo } = require('./logger');

function isTrustedDesktopClawOrigin(value) {
  return typeof value === 'string' && (value.startsWith('file://') || value.startsWith('app://'));
}

function getWindowPosition(bounds, windowConfig) {
  const { width, height, margin, anchor } = windowConfig;
  switch (anchor) {
    case 'bottom-left':
      return { x: bounds.x + margin, y: bounds.y + bounds.height - height - margin };
    case 'top-left':
      return { x: bounds.x + margin, y: bounds.y + margin };
    case 'top-right':
      return { x: bounds.x + bounds.width - width - margin, y: bounds.y + margin };
    case 'bottom-right':
    default:
      return { x: bounds.x + bounds.width - width - margin, y: bounds.y + bounds.height - height - margin };
  }
}

class UiShell {
  constructor(config) {
    this.config = config;
    this.window = null;
  }

  create() {
    const display = screen.getPrimaryDisplay();
    const position = getWindowPosition(display.workArea, this.config.window);

    this.window = new BrowserWindow({
      width: this.config.window.width,
      height: this.config.window.height,
      x: position.x,
      y: position.y,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      alwaysOnTop: this.config.alwaysOnTop,
      skipTaskbar: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.setAlwaysOnTop(this.config.alwaysOnTop, 'screen-saver');
    this.window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    this.window.setIgnoreMouseEvents(!!this.config.clickThroughWhenIdle, { forward: true });
    const { session } = this.window.webContents;
    session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
      const origin = requestingOrigin || details?.securityOrigin || '';
      if (permission === 'media' && isTrustedDesktopClawOrigin(origin)) {
        return details?.mediaType === 'audio' || details?.mediaType === 'unknown';
      }
      return false;
    });
    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const requestingUrl = details?.requestingUrl || webContents?.getURL?.() || '';
      if (permission === 'media' && isTrustedDesktopClawOrigin(requestingUrl)) {
        const mediaTypes = details?.mediaTypes || [];
        const allowAudioOnly = mediaTypes.length === 0 || mediaTypes.includes('audio');
        logInfo('permissions', 'Media permission requested', { requestingUrl, mediaTypes, granted: allowAudioOnly });
        callback(allowAudioOnly);
        return;
      }

      callback(false);
    });
    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const method = level >= 2 ? logError : logInfo;
      method('renderer-console', 'Console message', { level, message, line, sourceId });
    });
    this.window.webContents.on('render-process-gone', (_event, details) => {
      logError('renderer-process', 'Renderer process exited unexpectedly', details);
    });
    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
      logError('renderer-process', 'Renderer failed to load', { errorCode, errorDescription, validatedUrl });
    });
    return this.window;
  }

  applyConfig(config) {
    this.config = config;
    if (!this.window) return;
    this.window.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
    this.window.setIgnoreMouseEvents(!!config.clickThroughWhenIdle, { forward: true });
  }

  send(channel, payload) {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(channel, payload);
  }

  toggleVisibility() {
    if (!this.window) return;
    if (this.window.isVisible()) this.window.hide();
    else this.window.show();
  }

  setIgnoreMouseEvents(ignore) {
    if (!this.window) return false;
    this.window.setIgnoreMouseEvents(ignore, { forward: true });
    return true;
  }

  dragBy(delta) {
    if (!this.window) return false;
    const [x, y] = this.window.getPosition();
    this.window.setPosition(Math.round(x + delta.x), Math.round(y + delta.y));
    return true;
  }
}

module.exports = { UiShell };
