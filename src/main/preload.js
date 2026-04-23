const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopClaw', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  sendQuery: (text) => ipcRenderer.invoke('pet:query', text),
  listenNativeOnce: (options) => ipcRenderer.invoke('stt:listen-once', options),
  speakPiper: (text) => ipcRenderer.invoke('tts:speak-piper', text),
  getStatus: () => ipcRenderer.invoke('pet:status'),
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  logMessage: (payload) => ipcRenderer.invoke('log:message', payload),
  showNativeNotification: (payload) => ipcRenderer.invoke('notify:show', payload),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('window:set-ignore-mouse', ignore),
  dragWindow: (delta) => ipcRenderer.invoke('window:drag', delta),
  onShortcutListen: (callback) => ipcRenderer.on('shortcut:listen', callback),
  onShortcutStatus: (callback) => ipcRenderer.on('shortcut:status', callback),
  onSettingsOpen: (callback) => ipcRenderer.on('settings:open', callback),
  onConfigUpdated: (callback) => ipcRenderer.on('config:updated', (_event, config) => callback(config)),
});
