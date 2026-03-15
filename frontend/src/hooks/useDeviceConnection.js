import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeviceService from "../services/DeviceService";

/**
 * useDeviceConnection
 * - Does NOT auto-connect on refresh by default.
 * - Connection starts only when you call connect().
 * - Auto-reconnect works ONLY after the first user-initiated connect.
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
    deviceId = options.deviceId || "demo-device",

    // control auto-connect behavior
    autoConnect = options.autoConnect ?? false
  } = options;

  const serviceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const manuallyDisconnectedRef = useRef(false);

  // becomes true only after user clicks "Start Monitoring"
  const hasUserStartedRef = useRef(false);

  const [status, setStatus] = useState({ state: "idle", detail: "" }); // idle|connecting|connected|disconnected|error
  const [lastError, setLastError] = useState(null);

  // ✅ Updated defaults for ESP32 payload
  const [data, setData] = useState({
    moisture: 60,
    temperature: 28,
    humidity: 55,
    light: 500,
    light_state: "UNKNOWN",
    emotion: "happy",
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

  useEffect(() => {
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
    if (!hasUserStartedRef.current) return;
    if (manuallyDisconnectedRef.current) return;

    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectAttemptRef.current += 1;
      try {
        await serviceRef.current?.connect();
        reconnectAttemptRef.current = 0;
      } catch {
        scheduleReconnect();
      }
    }, delay);
  }, []);

  useEffect(() => {
    if (!hasUserStartedRef.current) return;
    if (status.state === "disconnected" || status.state === "error") {
      scheduleReconnect();
    }
  }, [status.state, scheduleReconnect]);

  const connect = useCallback(async () => {
    hasUserStartedRef.current = true;
    manuallyDisconnectedRef.current = false;
    setLastError(null);
    reconnectAttemptRef.current = 0;

    try {
      await serviceRef.current?.connect();
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

  useEffect(() => {
    if (!autoConnect) return;
    if (hasUserStartedRef.current) return;
    hasUserStartedRef.current = true;
    connect().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    data,
    status,
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