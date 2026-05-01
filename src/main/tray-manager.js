const path = require('node:path');
const { Menu, Tray, nativeImage, app } = require('electron');

class TrayManager {
  constructor(handlers) {
    this.handlers = handlers;
    this.tray = null;
    this.status = {
      state: 'unchecked',
      summary: 'Gateway: unchecked',
      detail: 'Use Refresh Gateway Status to test the current endpoint.',
      checkedAt: null,
    };
    this.modelState = {
      loading: false,
      models: [],
      current: null,
      error: '',
      checkedAt: null,
    };
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

  setGatewayStatus(status) {
    this.status = {
      ...this.status,
      ...(status || {}),
    };
    this.setMenu(this.config);
  }

  setModelState(modelState) {
    this.modelState = {
      ...this.modelState,
      ...(modelState || {}),
    };
    this.setMenu(this.config);
  }

  setMenu(config) {
    if (!this.tray) return;
    this.config = config;
    const gateway = config?.gateway || {};
    const checkedAt = this.status.checkedAt
      ? new Date(this.status.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'not checked';
    const endpoint = gateway.baseUrl || gateway.eventsUrl || 'not configured';
    const currentModel = this.modelState.current;
    const currentModelKey = currentModel?.modelKey || (
      currentModel?.modelProvider && currentModel?.model
        ? `${currentModel.modelProvider}/${currentModel.model}`
        : ''
    );
    const currentModelLabel = currentModelKey || gateway.model || 'unknown';
    const modelItems = this.modelState.models.length > 0
      ? this.modelState.models.map((model) => {
        const key = model.key || (model.provider && model.id ? `${model.provider}/${model.id}` : model.id);
        const labelName = model.name || model.id || key;
        const provider = model.provider ? ` (${model.provider})` : '';
        return {
          label: `${labelName}${provider}`,
          type: 'radio',
          checked: Boolean(key && currentModelKey && key === currentModelKey),
          click: () => this.handlers.onSelectModel?.(key),
        };
      })
      : [{ label: this.modelState.loading ? 'Loading models...' : 'No models loaded', enabled: false }];
    const modelMenu = [
      { label: `Current: ${currentModelLabel}`, enabled: false },
      ...(this.modelState.error ? [{ label: this.modelState.error, enabled: false }] : []),
      { type: 'separator' },
      { label: 'Refresh Models', click: () => this.handlers.onRefreshModels?.() },
      { type: 'separator' },
      ...modelItems,
    ];
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide Pet', click: () => this.handlers.onToggleVisibility?.() },
      { label: 'Open Prompt', click: () => this.handlers.onListen?.() },
      { label: config.mute ? 'Unmute' : 'Mute', click: () => this.handlers.onToggleMute?.() },
      { type: 'separator' },
      { label: 'OpenClaw Model', submenu: modelMenu },
      { type: 'separator' },
      { label: 'Stop Speaking', click: () => this.handlers.onStopSpeaking?.() },
      { label: 'Hide Reply', click: () => this.handlers.onHideReply?.() },
      { label: 'Cancel Active Requests', click: () => this.handlers.onCancelActive?.() },
      { label: 'Show Conversation History', click: () => this.handlers.onShowHistory?.() },
      { label: 'Show Diagnostics', click: () => this.handlers.onShowDiagnostics?.() },
      { type: 'separator' },
      { label: this.status.summary, enabled: false },
      { label: `Mode: ${gateway.mode || 'unknown'}`, enabled: false },
      { label: `Endpoint: ${endpoint}`, enabled: false },
      { label: `Last check: ${checkedAt}`, enabled: false },
      { label: this.status.detail, enabled: false, visible: Boolean(this.status.detail) },
      { label: 'Refresh Gateway Status', click: () => this.handlers.onCheckStatus?.() },
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
