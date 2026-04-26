const { app } = require('electron');
const path = require('node:path');
const { AppController } = require('./app-controller');
const { getLogPath, logError, logInfo } = require('./logger');

// Ensure Windows taskbar shows the correct icon and groups the app correctly
app.setName('DesktopClaw');
app.setAppUserModelId('com.openclaw.desktoppet');
app.setPath('userData', process.env.DESKTOPCLAW_USER_DATA_DIR || path.join(app.getPath('appData'), 'desktopclaw'));

let controller;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

process.on('uncaughtException', (error) => {
  logError('main-process', 'Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logError('main-process', 'Unhandled rejection', reason);
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  logInfo('app-lifecycle', 'Application ready', { logPath: getLogPath() });
  controller = new AppController();
  controller.init();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('second-instance', () => {
  controller?.uiShell?.showAndFocus?.();
});

app.on('child-process-gone', (_event, details) => {
  logError('app-lifecycle', 'Child process exited unexpectedly', details);
});

app.on('will-quit', () => {
  logInfo('app-lifecycle', 'Application quitting');
  controller?.destroy();
});
