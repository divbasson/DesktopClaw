const fs = require('node:fs');
const path = require('node:path');

const defaultConfigPath = path.join(__dirname, '..', '..', 'settings.defaults.json');

function getConfigPath() {
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'settings.json');
    }
  } catch {
    // Fallback for non-Electron contexts.
  }
  return defaultConfigPath;
}

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const defVal = defaults[key];
    const oveVal = overrides[key];
    if (
      oveVal !== null && typeof oveVal === 'object' && !Array.isArray(oveVal) &&
      defVal !== null && typeof defVal === 'object' && !Array.isArray(defVal)
    ) {
      result[key] = deepMerge(defVal, oveVal);
    } else {
      result[key] = oveVal;
    }
  }
  return result;
}

function ensureConfigFile(configPath) {
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const seed = fs.readFileSync(defaultConfigPath, 'utf8');
  fs.writeFileSync(configPath, seed, 'utf8');
}

function loadConfig() {
  const configPath = getConfigPath();
  ensureConfigFile(configPath);
  const raw = fs.readFileSync(configPath, 'utf8');
  const loaded = JSON.parse(raw);
  // Deep-merge with defaults so new fields (e.g. globalHotkeys) are always present
  // even when an older config.json predates those fields.
  const defaults = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
  return deepMerge(defaults, loaded);
}

function saveConfig(config) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = {
  defaultConfigPath,
  getConfigPath,
  loadConfig,
  saveConfig,
};
