export class EventStream {
  constructor({ onEvent, onOpen, onError, onState }) {
    this.onEvent = onEvent;
    this.onOpen = onOpen;
    this.onError = onError;
    this.onState = onState;
    this.socket = null;
    this.config = null;
    this.reconnectTimer = null;
  }

  updateConfig(config) {
    this.config = config;
    this.restart();
  }

  stop() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.onState?.('disconnected');
  }

  restart() {
    this.stop();
    if (!this.config?.gateway?.eventsEnabled || !this.config?.gateway?.eventsUrl) return;
    this.connect();
  }

  connect() {
    try {
      this.onState?.('connecting');
      this.socket = new WebSocket(this.config.gateway.eventsUrl);
      this.socket.onopen = () => {
        this.onOpen?.();
        this.onState?.('connected');
      };
      this.socket.onmessage = (event) => {
        let payload = event.data;
        try { payload = JSON.parse(event.data); } catch {}
        this.onEvent?.(payload);
      };
      this.socket.onerror = () => {
        this.onError?.('Event stream error');
        this.onState?.('error');
      };
      this.socket.onclose = () => {
        this.onState?.('disconnected');
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      };
    } catch (error) {
      this.onError?.(error.message);
      this.onState?.('error');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
  }
}
