const fs = require('node:fs');
const path = require('node:path');

const fallbackLogPath = path.join(process.cwd(), 'desktopclaw-debug.log');

function getApp() {
  try {
    const { app } = require('electron');
    return app;
  } catch {
    return null;
  }
}

function getLogPath() {
  const app = getApp();
  if (app?.getPath) {
    try {
      return path.join(app.getPath('userData'), 'logs', 'desktopclaw-debug.log');
    } catch {
      return fallbackLogPath;
    }
  }
  return fallbackLogPath;
}

function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}

function writeLog(level, scope, message, details = null) {
  const logPath = getLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    details,
  };

  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return logPath;
}

function logInfo(scope, message, details = null) {
  return writeLog('info', scope, message, details);
}

function logError(scope, message, details = null) {
  return writeLog('error', scope, message, normalizeError(details));
}

module.exports = {
  getLogPath,
  logError,
  logInfo,
};
