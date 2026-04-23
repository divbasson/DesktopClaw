const { globalShortcut } = require('electron');
const { logInfo, logError } = require('./logger');

class ShortcutManager {
  constructor(handlers) {
    this.handlers = handlers;
  }

  register(config) {
    globalShortcut.unregisterAll();
    const hotkeys = config.globalHotkeys || {};
    const { listen, toggleMute, toggleVisibility, openSettings } = hotkeys;

    if (listen) {
      const ok = globalShortcut.register(listen, () => this.handlers.onListen());
      if (ok) {
        logInfo('shortcuts', `Registered listen shortcut: ${listen}`);
      } else {
        const fallback = 'CommandOrControl+Shift+L';
        const fallbackOk = globalShortcut.register(fallback, () => this.handlers.onListen());
        if (fallbackOk) {
          logInfo('shortcuts', `Primary listen shortcut unavailable (${listen}); using fallback ${fallback}`);
        } else {
          logError('shortcuts', `Failed to register listen shortcut: ${listen} and fallback ${fallback}`);
        }
      }
    }
    if (toggleMute) globalShortcut.register(toggleMute, () => this.handlers.onToggleMute());
    if (toggleVisibility) globalShortcut.register(toggleVisibility, () => this.handlers.onToggleVisibility());
    if (openSettings) globalShortcut.register(openSettings, () => this.handlers.onOpenSettings());
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}

module.exports = { ShortcutManager };
