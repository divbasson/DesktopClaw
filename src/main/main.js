const { app } = require('electron');
const { AppController } = require('./app-controller');
const { getLogPath, logError, logInfo } = require('./logger');

// Ensure Windows taskbar shows the correct icon and groups the app correctly
app.setAppUserModelId('com.openclaw.desktoppet');

let controller;

process.on('uncaughtException', (error) => {
  logError('main-process', 'Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logError('main-process', 'Unhandled rejection', reason);
});

app.whenReady().then(() => {
  logInfo('app-lifecycle', 'Application ready', { logPath: getLogPath() });
  controller = new AppController();
  controller.init();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('child-process-gone', (_event, details) => {
  logError('app-lifecycle', 'Child process exited unexpectedly', details);
});

app.on('will-quit', () => {
  logInfo('app-lifecycle', 'Application quitting');
  controller?.destroy();
});
