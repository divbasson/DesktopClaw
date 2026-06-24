const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const fallbackLogPath = path.join(process.cwd(), 'desktopclaw-debug.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;
const sessionId = randomUUID();

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

function rotateLogsIfNeeded(logPath) {
  try {
    const stats = fs.statSync(logPath);
    if (!stats.isFile() || stats.size < MAX_LOG_BYTES) return;

    for (let index = MAX_ROTATED_FILES; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      const dest = `${logPath}.${index + 1}`;
      if (!fs.existsSync(source)) continue;
      if (index === MAX_ROTATED_FILES) {
        fs.rmSync(source, { force: true });
      } else {
        fs.renameSync(source, dest);
      }
    }

    fs.renameSync(logPath, `${logPath}.1`);
  } catch {
    // Rotation best-effort only; never block app flow on log housekeeping.
  }
}

function writeLog(level, scope, message, details = null) {
  const logPath = getLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  rotateLogsIfNeeded(logPath);

  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    pid: process.pid,
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
