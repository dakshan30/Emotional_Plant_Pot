/**
 * DeviceService
 * - Supports 3 transports: REST, WebSocket, MQTT
 *
 * Usage:
 *   const svc = new DeviceService({ transport: "rest", ... });
 *   await svc.connect();
 *   svc.onData((data) => console.log(data));
 *   svc.disconnect();
 */

export default class DeviceService {
  constructor(options = {}) {
    this.transport = (options.transport || "rest").toLowerCase(); // "rest" | "ws" | "mqtt"

    this.restBaseUrl = options.restBaseUrl || "";
    this.wsUrl = options.wsUrl || "";
    this.mqttBrokerUrl = options.mqttBrokerUrl || "";
    this.mqttTopic = options.mqttTopic || "plantpot/telemetry";
    this.mqttUsername = options.mqttUsername || "";
    this.mqttPassword = options.mqttPassword || "";
    this.deviceId = options.deviceId || "emotional-plant-pot";

    this._connected = false;

    this._onStatus = new Set();
    this._onData = new Set();
    this._onError = new Set();

    this._ws = null;
    this._mqtt = null;
    this._restPollTimer = null;
    this._abortController = null;
  }

  onStatus(cb) {
    this._onStatus.add(cb);
    return () => this._onStatus.delete(cb);
  }

  onData(cb) {
    this._onData.add(cb);
    return () => this._onData.delete(cb);
  }

  onError(cb) {
    this._onError.add(cb);
    return () => this._onError.delete(cb);
  }

  _emitStatus(status) {
    this._onStatus.forEach((cb) => cb(status));
  }

  _emitData(data) {
    this._onData.forEach((cb) => cb(data));
  }

  _emitError(err) {
    this._onError.forEach((cb) => cb(err));
  }

  get isConnected() {
    return this._connected;
  }

  async connect() {
    if (this._connected) return;

    this._emitStatus({ state: "connecting" });

    if (this.transport === "ws") {
      return this._connectWebSocket();
    }

    if (this.transport === "rest") {
      return this._connectRest();
    }

    if (this.transport === "mqtt") {
      return this._connectMqtt();
    }

    const err = new Error(`Unknown transport: ${this.transport}`);
    this._emitStatus({ state: "error", detail: err.message });
    throw err;
  }

  disconnect() {
    this._connected = false;
    this._emitStatus({ state: "disconnected" });

    // stop REST polling
    if (this._restPollTimer) clearInterval(this._restPollTimer);
    this._restPollTimer = null;
    if (this._abortController) this._abortController.abort();
    this._abortController = null;

    // close WS
    if (this._ws) {
      try {
        this._ws.close();
      } catch {}
      this._ws = null;
    }

    // close MQTT
    if (this._mqtt) {
      try {
        this._mqtt.end?.(true);
      } catch {}
      this._mqtt = null;
    }
  }

  // -----------------------------
  // WebSocket
  // -----------------------------
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      if (!this.wsUrl) {
        const err = new Error("Missing WS URL. Set VITE_DEVICE_WS_URL / REACT_APP_DEVICE_WS_URL.");
        this._emitStatus({ state: "error", detail: err.message });
        reject(err);
        return;
      }

      const ws = new WebSocket(this.wsUrl);
      this._ws = ws;

      ws.onopen = () => {
        this._connected = true;
        this._emitStatus({ state: "connected", detail: "WebSocket connected" });
        resolve();
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          // Expected: { moisture, temperature, light, ts? }
          this._emitData({ deviceId: this.deviceId, ts: payload.ts || Date.now(), ...payload });
        } catch (e) {
          this._emitError(e);
        }
      };

      ws.onerror = () => {
        const err = new Error("WebSocket error");
        this._emitError(err);
      };

      ws.onclose = () => {
        const wasConnected = this._connected;
        this._connected = false;
        this._emitStatus({
          state: "disconnected",
          detail: wasConnected ? "WebSocket closed" : "WebSocket failed"
        });
      };
    });
  }

  // -----------------------------
  // REST (polling)
  // -----------------------------
  async _connectRest() {
    if (!this.restBaseUrl) {
      const err = new Error("Missing REST base URL. Set VITE_DEVICE_REST_URL / REACT_APP_DEVICE_REST_URL.");
      this._emitStatus({ state: "error", detail: err.message });
      throw err;
    }

    // A real device could expose:
    //   GET {REST_URL}/health  -> { ok: true }
    //   GET {REST_URL}/telemetry -> { moisture, temperature, light }
    const healthUrl = joinUrl(this.restBaseUrl, "/health");
    const telemetryUrl = joinUrl(this.restBaseUrl, "/telemetry");

    try {
      this._abortController = new AbortController();

      const res = await fetch(healthUrl, { signal: this._abortController.signal });
      if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);

      this._connected = true;
      this._emitStatus({ state: "connected", detail: "REST device reachable" });

      const poll = async () => {
        try {
          const r = await fetch(telemetryUrl, { signal: this._abortController.signal });
          if (!r.ok) throw new Error(`Telemetry failed: HTTP ${r.status}`);
          const payload = await r.json();
          this._emitData({ deviceId: this.deviceId, ts: payload.ts || Date.now(), ...payload });
        } catch (e) {
          this._emitError(e);
        }
      };

      await poll();
      this._restPollTimer = setInterval(poll, 2000);
    } catch (e) {
      this._connected = false;
      this._emitStatus({ state: "error", detail: e.message });
      throw e;
    }
  }

  // -----------------------------
  // MQTT
  // -----------------------------
  async _connectMqtt() {
    // IMPORTANT: we keep this import dynamic so your app runs static even without mqtt installed.
    if (!this.mqttBrokerUrl) {
      const err = new Error("Missing MQTT broker URL. Set VITE_MQTT_BROKER_URL / REACT_APP_MQTT_BROKER_URL.");
      this._emitStatus({ state: "error", detail: err.message });
      throw err;
    }

    let mqtt;
    try {
      mqtt = await import("mqtt");
    } catch (e) {
      const err = new Error(
        "MQTT package not installed. Run: npm i mqtt (only required when using MQTT transport)."
      );
      this._emitStatus({ state: "error", detail: err.message });
      throw err;
    }

    return new Promise((resolve, reject) => {
      try {
        const client = mqtt.connect(this.mqttBrokerUrl, {
          username: this.mqttUsername || undefined,
          password: this.mqttPassword || undefined,
          reconnectPeriod: 0 // we handle reconnect in the hook
        });

        this._mqtt = client;

        client.on("connect", () => {
          this._connected = true;
          this._emitStatus({ state: "connected", detail: "MQTT connected" });

          client.subscribe(this.mqttTopic, (err) => {
            if (err) this._emitError(err);
          });

          resolve();
        });

        client.on("message", (_topic, message) => {
          try {
            const payload = JSON.parse(message.toString());
            this._emitData({ deviceId: this.deviceId, ts: payload.ts || Date.now(), ...payload });
          } catch (e) {
            this._emitError(e);
          }
        });

        client.on("error", (err) => {
          this._emitError(err);
        });

        client.on("close", () => {
          const wasConnected = this._connected;
          this._connected = false;
          this._emitStatus({
            state: "disconnected",
            detail: wasConnected ? "MQTT disconnected" : "MQTT connect failed"
          });
        });
      } catch (e) {
        this._emitStatus({ state: "error", detail: e.message });
        reject(e);
      }
    });
  }
}

// -------- helpers
function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}
