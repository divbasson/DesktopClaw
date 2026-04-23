const { ipcMain } = require('electron');
const { ConfigStore } = require('./config-store');
const { UiShell } = require('./ui-shell');
const { ShortcutManager } = require('./shortcut-manager');
const { OpenClawClient } = require('./openclaw-client');
const { TrayManager } = require('./tray-manager');
const { Notifier } = require('./notifier');
const { NativeSttService } = require('./native-stt');
const { NativeTtsService } = require('./native-tts');
const { getLogPath, logError, logInfo } = require('./logger');

class AppController {
  constructor() {
    this.configStore = new ConfigStore();
    this.config = this.configStore.get();
    this.client = new OpenClawClient(this.config);
    this.nativeStt = new NativeSttService();
    this.nativeTts = new NativeTtsService();
    this.uiShell = new UiShell(this.config);
    this.notifier = new Notifier();
    this.shortcutManager = new ShortcutManager({
      onListen: () => this.uiShell.send('shortcut:listen'),
      onToggleMute: () => this.setConfig({ ...this.config, mute: !this.config.mute }),
      onToggleVisibility: () => this.uiShell.toggleVisibility(),
      onOpenSettings: () => this.uiShell.send('settings:open'),
    });
    this.trayManager = new TrayManager({
      onListen: () => this.uiShell.send('shortcut:listen'),
      onToggleMute: () => this.setConfig({ ...this.config, mute: !this.config.mute }),
      onToggleVisibility: () => this.uiShell.toggleVisibility(),
      onOpenSettings: () => this.uiShell.send('settings:open'),
      onCheckStatus: () => this.uiShell.send('shortcut:status'),
      onQuit: () => this.destroy(),
    });
  }

  init() {
    this.uiShell.create();
    this.shortcutManager.register(this.config);
    this.trayManager.create(this.config);
    this.bindIpc();
    logInfo('app-controller', 'Controller initialized');
  }

  bindIpc() {
    ipcMain.handle('config:get', () => this.config);
    ipcMain.handle('config:set', (_event, nextConfig) => this.setConfig(nextConfig));
    ipcMain.handle('pet:query', async (_event, text) => this.safeCall(() => this.client.sendQuery(text)));
    ipcMain.handle('stt:listen-once', async (_event, options) => this.safeCall(() => this.nativeStt.listenOnce(options)));
    ipcMain.handle('tts:speak-piper', async (_event, text) => this.safeCall(() => this.nativeTts.synthesize({
      text,
      piperExe: this.config.tts?.piperExe || '',
      modelPath: this.config.tts?.piperModel || '',
    })));
    ipcMain.handle('pet:status', async () => this.safeCall(() => this.client.getStatus()));
    ipcMain.handle('window:set-ignore-mouse', (_event, ignore) => this.uiShell.setIgnoreMouseEvents(ignore));
    ipcMain.handle('window:drag', (_event, delta) => this.uiShell.dragBy(delta));
    ipcMain.handle('notify:show', (_event, payload) => {
      if (this.config?.status?.nativeNotifications === false) return false;
      return this.notifier.notify(payload);
    });
    ipcMain.handle('log:get-path', () => getLogPath());
    ipcMain.handle('log:message', (_event, payload) => {
      const { scope = 'renderer', message = 'Log message', details = null, level = 'info' } = payload || {};
      if (level === 'error') return logError(scope, message, details);
      return logInfo(scope, message, details);
    });
  }

  setConfig(nextConfig) {
    const previousClient = this.client;
    try {
      this.config = this.configStore.set(nextConfig);
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
    previousClient?.close?.();
    this.client = new OpenClawClient(this.config);
    this.uiShell.applyConfig(this.config);
    this.shortcutManager.register(this.config);
    this.trayManager.setMenu(this.config);
    this.uiShell.send('config:updated', this.config);
    return this.config;
  }

  async safeCall(fn) {
    try {
      return await fn();
    } catch (error) {
      logError('app-controller', 'IPC request failed', error);
      return { ok: false, error: error.message };
    }
  }

  destroy() {
    this.client?.close?.();
    this.shortcutManager.unregisterAll();
    this.trayManager.destroy();
  }
}

module.exports = { AppController };
