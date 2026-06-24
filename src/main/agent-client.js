const { OpenClawClient, ADMIN_OPERATOR_SCOPES } = require('./openclaw-client');
const { HermesAgentClient } = require('./hermes-agent-client');

function getAgentProvider(config) {
  const provider = String(config?.agent?.provider || config?.provider || 'openclaw').trim().toLowerCase();
  return provider === 'hermes' ? 'hermes' : 'openclaw';
}

function getAgentLabel(config) {
  return getAgentProvider(config) === 'hermes' ? 'Hermes' : 'OpenClaw';
}

function createAgentClient(config) {
  return getAgentProvider(config) === 'hermes'
    ? new HermesAgentClient(config)
    : new OpenClawClient(config);
}

module.exports = {
  ADMIN_OPERATOR_SCOPES,
  createAgentClient,
  getAgentLabel,
  getAgentProvider,
};
