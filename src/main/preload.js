const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopClaw', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  sendQuery: (text) => ipcRenderer.invoke('pet:query', text),
  sendQueryStream: (payload) => ipcRenderer.invoke('pet:query-stream', payload),
  listenNativeOnce: (options) => ipcRenderer.invoke('stt:listen-once', options),
  speakPiper: (text) => ipcRenderer.invoke('tts:speak-piper', text),
  getStatus: () => ipcRenderer.invoke('pet:status'),
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  logMessage: (payload) => ipcRenderer.invoke('log:message', payload),
  showNativeNotification: (payload) => ipcRenderer.invoke('notify:show', payload),
  setAudioActive: (active) => ipcRenderer.invoke('audio:set-active', !!active),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('window:set-ignore-mouse', ignore),
  dragWindow: (delta) => ipcRenderer.invoke('window:drag', delta),
  onAudioActive: (callback) => ipcRenderer.on('audio:active', (_event, active) => callback(!!active)),
  onShortcutListen: (callback) => ipcRenderer.on('shortcut:listen', callback),
  onShortcutStatus: (callback) => ipcRenderer.on('shortcut:status', callback),
  onGatewayStatus: (callback) => ipcRenderer.on('gateway:status', (_event, status) => callback(status)),
  onSettingsOpen: (callback) => ipcRenderer.on('settings:open', callback),
  onTrayCommand: (callback) => ipcRenderer.on('tray:command', (_event, command) => callback(command)),
  onConfigUpdated: (callback) => ipcRenderer.on('config:updated', (_event, config) => callback(config)),
  onQueryProgress: (requestId, callback) => {
    const channel = `pet:query-progress:${requestId}`;
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
