const { loadConfig, saveConfig } = require('../shared/config');

class ConfigStore {
  constructor() {
    this.config = loadConfig();
  }

  get() {
    return this.config;
  }

  set(nextConfig) {
    this.config = nextConfig;
    saveConfig(this.config);
    return this.config;
  }

  patch(mutator) {
    const draft = JSON.parse(JSON.stringify(this.config));
    const nextConfig = mutator(draft) || draft;
    return this.set(nextConfig);
  }
}

module.exports = { ConfigStore };
