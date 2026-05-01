const { ipcMain } = require('electron');
const { ConfigStore } = require('./config-store');
const { UiShell } = require('./ui-shell');
const { ShortcutManager } = require('./shortcut-manager');
const { OpenClawClient, ADMIN_OPERATOR_SCOPES } = require('./openclaw-client');
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
    this.activeQueryClients = new Set();
    this.nativeStt = new NativeSttService();
    this.nativeTts = new NativeTtsService();
    this.uiShell = new UiShell(this.config);
    this.notifier = new Notifier();
    this.shortcutManager = new ShortcutManager({
      onListen: () => {
        this.uiShell.showAndFocus();
        this.uiShell.send('shortcut:listen');
      },
      onToggleMute: () => this.setConfig({ ...this.config, mute: !this.config.mute }),
      onToggleVisibility: () => this.uiShell.toggleVisibility(),
      onOpenSettings: () => this.uiShell.send('settings:open'),
    });
    this.trayManager = new TrayManager({
      onListen: () => {
        this.uiShell.showAndFocus();
        this.uiShell.send('shortcut:listen');
      },
      onToggleMute: () => this.setConfig({ ...this.config, mute: !this.config.mute }),
      onToggleVisibility: () => this.uiShell.toggleVisibility(),
      onOpenSettings: () => this.uiShell.send('settings:open'),
      onStopSpeaking: () => this.uiShell.send('tray:command', 'stop-speaking'),
      onHideReply: () => this.uiShell.send('tray:command', 'hide-reply'),
      onCancelActive: () => this.uiShell.send('tray:command', 'cancel-active'),
      onShowHistory: () => this.uiShell.send('tray:command', 'show-history'),
      onShowDiagnostics: () => this.uiShell.send('tray:command', 'show-diagnostics'),
      onCheckStatus: () => this.refreshGatewayStatus({ notifyRenderer: true }),
      onRefreshModels: () => this.refreshModels({ notifyRenderer: true }),
      onSelectModel: (modelKey) => this.selectOpenClawModel(modelKey),
      onQuit: () => this.destroy(),
    });
  }

  init() {
    this.uiShell.create();
    this.shortcutManager.register(this.config);
    this.trayManager.create(this.config);
    this.bindIpc();
    this.refreshModels({ silent: true }).catch((error) => {
      logError('openclaw-models', 'Initial model refresh failed', error);
    });
    logInfo('app-controller', 'Controller initialized');
  }

  bindIpc() {
    ipcMain.handle('config:get', () => this.config);
    ipcMain.handle('config:set', (_event, nextConfig) => this.setConfig(nextConfig));
    ipcMain.handle('pet:query', async (_event, text) => this.safeCall(() => this.sendPetQuery(text)));
    ipcMain.handle('pet:query-stream', async (event, payload) => {
      const text = typeof payload === 'string' ? payload : payload?.text;
      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
      return this.safeCall(() => this.sendPetQuery(text, {
        onProgress: (progress) => {
          if (!requestId) return;
          event.sender.send(`pet:query-progress:${requestId}`, progress);
        },
      }));
    });
    ipcMain.handle('stt:listen-once', async (_event, options) => this.safeCall(() => this.nativeStt.listenOnce(options)));
    ipcMain.handle('tts:speak-piper', async (_event, text) => this.safeCall(() => this.nativeTts.synthesize({
      text,
      piperExe: this.config.tts?.piperExe || '',
      modelPath: this.config.tts?.piperModel || '',
    })));
    ipcMain.handle('pet:status', async () => this.getGatewayStatus());
    ipcMain.handle('models:list', async () => this.refreshModels({ notifyRenderer: false }));
    ipcMain.handle('models:set-current', async (_event, modelKey) => this.selectOpenClawModel(modelKey));
    ipcMain.handle('audio:set-active', (_event, active) => {
      this.uiShell.send('audio:active', !!active);
      return true;
    });
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
    if (this.activeQueryClients.has(previousClient)) {
      logInfo('app-controller', 'Keeping previous OpenClaw client alive for active query');
    } else {
      previousClient?.close?.();
    }
    this.client = new OpenClawClient(this.config);
    this.uiShell.applyConfig(this.config);
    this.shortcutManager.register(this.config);
    this.trayManager.setMenu(this.config);
    this.uiShell.send('config:updated', this.config);
    return this.config;
  }

  async sendPetQuery(text, options = {}) {
    const client = this.client;
    this.activeQueryClients.add(client);
    try {
      return await client.sendQuery(text, options);
    } finally {
      this.activeQueryClients.delete(client);
      if (client !== this.client) {
        client.close();
      }
    }
  }

  summarizeGatewayStatus(result) {
    const mode = this.config?.gateway?.mode || 'unknown';
    if (!result?.ok) {
      return {
        state: 'offline',
        summary: 'Gateway: offline',
        detail: result?.error || 'Status check failed.',
        checkedAt: Date.now(),
      };
    }

    const data = result.data || {};
    const sessions = data.sessions != null ? `${data.sessions} sessions` : null;
    const agents = data.agents != null ? `${data.agents} agents` : null;
    const counts = [sessions, agents].filter(Boolean).join(', ');
    const status = data.status || (mode === 'mock' ? 'mock-online' : 'online');
    return {
      state: 'online',
      summary: `Gateway: ${status}`,
      detail: counts || `Mode: ${mode}`,
      checkedAt: Date.now(),
    };
  }

  async getGatewayStatus() {
    const result = await this.safeCall(() => this.client.getStatus());
    this.trayManager.setGatewayStatus(this.summarizeGatewayStatus(result));
    return result;
  }

  async refreshGatewayStatus({ notifyRenderer = false, silent = false } = {}) {
    const result = await this.getGatewayStatus();
    if (notifyRenderer) {
      this.uiShell.send('gateway:status', { ...result, fromTray: true });
    }
    if (!silent) {
      logInfo('gateway-status', 'Gateway status refreshed', result);
    }
    return result;
  }

  summarizeModelError(error) {
    const message = error?.message || String(error || 'Model operation failed.');
    if (/scope upgrade|pairing approval/i.test(message)) {
      return 'Needs gateway admin approval';
    }
    if (/missing scope/i.test(message)) {
      return 'Needs operator.admin scope';
    }
    return message;
  }

  async refreshModels({ notifyRenderer = false, silent = false } = {}) {
    this.trayManager.setModelState({ loading: true, error: '' });
    try {
      const [models, current] = await Promise.all([
        this.client.listModels(),
        this.client.getSessionModel(),
      ]);
      const state = {
        loading: false,
        models: models.models || [],
        current,
        error: '',
        checkedAt: Date.now(),
      };
      this.trayManager.setModelState(state);
      if (notifyRenderer) {
        this.uiShell.send('gateway:status', {
          ok: true,
          fromTray: true,
          data: {
            status: 'models-loaded',
            models: state.models.length,
            model: current.modelKey,
          },
        });
      }
      if (!silent) {
        logInfo('openclaw-models', 'OpenClaw models refreshed', {
          count: state.models.length,
          current: current.modelKey,
        });
      }
      return { ok: true, models: state.models, current };
    } catch (error) {
      const summary = this.summarizeModelError(error);
      this.trayManager.setModelState({ loading: false, error: summary, checkedAt: Date.now() });
      logError('openclaw-models', 'OpenClaw model refresh failed', error);
      return { ok: false, error: summary };
    }
  }

  async selectOpenClawModel(modelKey) {
    const adminConfig = {
      ...this.config,
      gateway: {
        ...(this.config.gateway || {}),
        scopes: ADMIN_OPERATOR_SCOPES,
      },
    };
    this.trayManager.setModelState({ loading: true, error: '' });
    const adminClient = new OpenClawClient(adminConfig);
      let result;
      try {
        result = await this.safeCall(async () => {
          try {
            return await adminClient.setSessionModel(modelKey);
          } finally {
            adminClient.close();
          }
        });
      } catch (err) {
        // Model switching not supported
        const summary = 'Model switching is not supported by the current OpenClaw backend.';
        this.trayManager.setModelState({ loading: false, error: summary, checkedAt: Date.now() });
        this.uiShell.send('gateway:status', {
          error: summary,
          fromTray: true,
        });
        return;
      }
    if (!result?.ok) {
      const summary = this.summarizeModelError(new Error(result?.error || 'Failed to set OpenClaw model.'));
      this.trayManager.setModelState({ loading: false, error: summary, checkedAt: Date.now() });
      this.uiShell.send('gateway:status', {
        ok: false,
        fromTray: true,
        error: summary,
      });
      return { ok: false, error: summary };
    }

    const selected = {
      modelKey: result.modelKey,
      modelProvider: result.modelProvider,
      model: result.model,
    };
    this.setConfig({
      ...this.config,
      gateway: {
        ...(this.config.gateway || {}),
        scopes: ADMIN_OPERATOR_SCOPES,
        modelProvider: result.modelProvider,
        model: result.model,
      },
    });
    this.trayManager.setModelState({
      loading: false,
      current: selected,
      error: '',
      checkedAt: Date.now(),
    });
    logInfo('openclaw-models', 'OpenClaw session model selected', {
      model: result.modelKey,
      method: result.method,
    });
    this.uiShell.send('gateway:status', {
      ok: true,
      fromTray: true,
      data: {
        status: 'model-selected',
        model: result.modelKey,
      },
    });
    return result;
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
