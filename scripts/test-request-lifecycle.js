const assert = require('node:assert/strict');

const REQUEST_STATES = {
  QUEUED: 'queued',
  SENT: 'sent',
  WAITING: 'waiting',
  RESPONDING: 'responding',
  COMPLETED: 'completed',
  FAILED: 'failed',
  INTERRUPTED: 'interrupted',
  CANCELLED: 'cancelled',
};

const TERMINAL_STATES = new Set([
  REQUEST_STATES.COMPLETED,
  REQUEST_STATES.FAILED,
  REQUEST_STATES.INTERRUPTED,
  REQUEST_STATES.CANCELLED,
]);

class RequestHarness {
  constructor() {
    this.requests = new Map();
    this.history = [];
    this.progressOwner = null;
    this.progressActivity = null;
    this.removed = [];
  }

  create(id) {
    this.requests.set(id, {
      id,
      state: REQUEST_STATES.QUEUED,
      cancelled: false,
      removeScheduled: false,
    });
  }

  activeRequests() {
    return [...this.requests.values()].filter((request) => (
      !request.cancelled && !TERMINAL_STATES.has(request.state)
    ));
  }

  transition(id, state) {
    const request = this.requests.get(id);
    if (!request) return;
    if (TERMINAL_STATES.has(request.state) && !TERMINAL_STATES.has(state)) return;
    request.state = state;
    if (TERMINAL_STATES.has(state)) {
      request.removeScheduled = true;
      if (!this.history.includes(id)) this.history.push(id);
    }
  }

  remove(id) {
    this.requests.delete(id);
    this.removed.push(id);
  }

  setProgress(id, activity) {
    this.progressOwner = id;
    this.progressActivity = activity;
  }

  clearProgress(id, { force = false } = {}) {
    if (!this.progressActivity) return;
    if (!force && id && this.progressOwner && this.progressOwner !== id) return;
    const replacement = this.activeRequests().find((request) => request.id !== id);
    if (!force && replacement) {
      this.setProgress(replacement.id, 'coding');
      return;
    }
    this.progressOwner = null;
    this.progressActivity = null;
  }

  cancel(id) {
    const request = this.requests.get(id);
    if (!request) return false;
    request.cancelled = true;
    this.transition(id, REQUEST_STATES.CANCELLED);
    this.clearProgress(id);
    return true;
  }
}

function testSingleRequestCompletesAndFades() {
  const harness = new RequestHarness();
  harness.create('a');
  harness.setProgress('a', 'coding');
  harness.transition('a', REQUEST_STATES.COMPLETED);
  harness.clearProgress('a');
  assert.equal(harness.progressActivity, null);
  assert.equal(harness.requests.get('a').removeScheduled, true);
  assert.deepEqual(harness.history, ['a']);
}

function testCancelActiveClearsPose() {
  const harness = new RequestHarness();
  harness.create('a');
  harness.setProgress('a', 'coding');
  harness.cancel('a');
  assert.equal(harness.progressActivity, null);
  assert.equal(harness.requests.get('a').state, REQUEST_STATES.CANCELLED);
}

function testOverlappingRequestsKeepBusyPose() {
  const harness = new RequestHarness();
  harness.create('a');
  harness.create('b');
  harness.setProgress('a', 'coding');
  harness.transition('a', REQUEST_STATES.COMPLETED);
  harness.clearProgress('a');
  assert.equal(harness.progressOwner, 'b');
  assert.equal(harness.progressActivity, 'coding');
}

function testLateProgressAfterTerminalIgnored() {
  const harness = new RequestHarness();
  harness.create('a');
  harness.transition('a', REQUEST_STATES.COMPLETED);
  harness.transition('a', REQUEST_STATES.WAITING);
  assert.equal(harness.requests.get('a').state, REQUEST_STATES.COMPLETED);
}

testSingleRequestCompletesAndFades();
testCancelActiveClearsPose();
testOverlappingRequestsKeepBusyPose();
testLateProgressAfterTerminalIgnored();

console.log('request lifecycle regression checks passed');
