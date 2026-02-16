import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeviceService from "../services/DeviceService";

/**
 * useDeviceConnection
 * - Central state management for connectivity + telemetry
 * - Auto reconnect with exponential backoff
 * - Works in MOCK mode by default (static demo)
 */
export default function useDeviceConnection(options = {}) {
  const {
    transport = getEnv("VITE_DEVICE_TRANSPORT", getEnv("REACT_APP_DEVICE_TRANSPORT", "mock")),
    mockMode = getEnv("VITE_MOCK_DEVICE", getEnv("REACT_APP_MOCK_DEVICE", "true")) === "true",
    restBaseUrl = getEnv("VITE_DEVICE_REST_URL", getEnv("REACT_APP_DEVICE_REST_URL", "")),
    wsUrl = getEnv("VITE_DEVICE_WS_URL", getEnv("REACT_APP_DEVICE_WS_URL", "")),
    mqttBrokerUrl = getEnv("VITE_MQTT_BROKER_URL", getEnv("REACT_APP_MQTT_BROKER_URL", "")),
    mqttTopic = getEnv("VITE_MQTT_TOPIC", getEnv("REACT_APP_MQTT_TOPIC", "plantpot/telemetry")),
    mqttUsername = getEnv("VITE_MQTT_USERNAME", getEnv("REACT_APP_MQTT_USERNAME", "")),
    mqttPassword = getEnv("VITE_MQTT_PASSWORD", getEnv("REACT_APP_MQTT_PASSWORD", "")),
    deviceId = options.deviceId || "demo-device"
  } = options;

  const serviceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const manuallyDisconnectedRef = useRef(false);

  const [status, setStatus] = useState({ state: "idle", detail: "" }); // idle|connecting|connected|disconnected|error
  const [lastError, setLastError] = useState(null);
  const [data, setData] = useState({
    moisture: 60,
    temperature: 28,
    light: 500,
    ts: Date.now()
  });

  const config = useMemo(
    () => ({
      transport,
      mockMode,
      restBaseUrl,
      wsUrl,
      mqttBrokerUrl,
      mqttTopic,
      mqttUsername,
      mqttPassword,
      deviceId
    }),
    [transport, mockMode, restBaseUrl, wsUrl, mqttBrokerUrl, mqttTopic, mqttUsername, mqttPassword, deviceId]
  );

  // Create service once per config
  useEffect(() => {
    // cleanup existing
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }

    const svc = new DeviceService(config);

    svc.onStatus((s) => setStatus(s));
    svc.onData((payload) => {
      setData((prev) => ({
        ...prev,
        ...payload
      }));
    });
    svc.onError((err) => setLastError(err));

    serviceRef.current = svc;

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      svc.disconnect();
    };
  }, [config]);

  const scheduleReconnect = useCallback(() => {
    if (manuallyDisconnectedRef.current) return;

    const attempt = reconnectAttemptRef.current;
    // backoff: 1s, 2s, 4s, 8s, 10s max
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectAttemptRef.current += 1;
      try {
        await serviceRef.current?.connect();
        reconnectAttemptRef.current = 0; // reset on success
      } catch {
        scheduleReconnect();
      }
    }, delay);
  }, []);

  // Auto reconnect when we become disconnected/error after a prior connect attempt
  useEffect(() => {
    if (status.state === "disconnected" || status.state === "error") {
      // only try to reconnect if user had clicked connect before
      if (!manuallyDisconnectedRef.current && reconnectAttemptRef.current >= 0) {
        scheduleReconnect();
      }
    }
  }, [status.state, scheduleReconnect]);

  const connect = useCallback(async () => {
    manuallyDisconnectedRef.current = false;
    setLastError(null);
    reconnectAttemptRef.current = 0;

    try {
      await serviceRef.current?.connect();
      // success => no need to schedule
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    } catch (e) {
      setLastError(e);
      scheduleReconnect();
      throw e;
    }
  }, [scheduleReconnect]);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    reconnectAttemptRef.current = 0;

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;

    serviceRef.current?.disconnect();
  }, []);

  return {
    data,
    status, // { state, detail }
    lastError,
    connect,
    disconnect,
    isConnected: status.state === "connected",
    isConnecting: status.state === "connecting",
    transport,
    mockMode
  };
}

function getEnv(key, fallback) {
  // Vite uses import.meta.env, CRA uses process.env
  // Guard for environments where import.meta is unavailable
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && key in import.meta.env) {
      return import.meta.env[key];
    }
  } catch {}
  if (typeof process !== "undefined" && process.env && key in process.env) {
    return process.env[key];
  }
  return fallback;
}