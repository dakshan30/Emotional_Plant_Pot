import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeviceService from "../services/DeviceService";

const DEFAULT_DEVICE_REST_URL = "http://192.168.137.249";

/**
 * useDeviceConnection
 * - Does NOT auto-connect on refresh by default.
 * - Connection starts only when you call connect().
 * - Auto-reconnect works ONLY after the first user-initiated connect.
 */
export default function useDeviceConnection(options = {}) {
  const {
    transport = getEnv("VITE_DEVICE_TRANSPORT", getEnv("REACT_APP_DEVICE_TRANSPORT", "rest")),
    restBaseUrl = getEnv(
      "VITE_DEVICE_REST_URL",
      getEnv("REACT_APP_DEVICE_REST_URL", DEFAULT_DEVICE_REST_URL)
    ),
    wsUrl = getEnv("VITE_DEVICE_WS_URL", getEnv("REACT_APP_DEVICE_WS_URL", "")),
    mqttBrokerUrl = getEnv("VITE_MQTT_BROKER_URL", getEnv("REACT_APP_MQTT_BROKER_URL", "")),
    mqttTopic = getEnv("VITE_MQTT_TOPIC", getEnv("REACT_APP_MQTT_TOPIC", "plantpot/telemetry")),
    mqttUsername = getEnv("VITE_MQTT_USERNAME", getEnv("REACT_APP_MQTT_USERNAME", "")),
    mqttPassword = getEnv("VITE_MQTT_PASSWORD", getEnv("REACT_APP_MQTT_PASSWORD", "")),
    deviceId = options.deviceId || "emotional-plant-pot",

    // NEW: control auto-connect behavior
    autoConnect = options.autoConnect ?? false
  } = options;

  const serviceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const manuallyDisconnectedRef = useRef(false);

  // NEW: becomes true only after user clicks "Start Monitoring"
  const hasUserStartedRef = useRef(false);

  const [status, setStatus] = useState({ state: "idle", detail: "" }); // idle|connecting|connected|disconnected|error
  const [lastError, setLastError] = useState(null);
  const [data, setData] = useState({
    moisture: null,
    temperature: null,
    light: null,
    ts: null
  });

  const config = useMemo(
    () => ({
      transport,
      restBaseUrl,
      wsUrl,
      mqttBrokerUrl,
      mqttTopic,
      mqttUsername,
      mqttPassword,
      deviceId
    }),
    [transport, restBaseUrl, wsUrl, mqttBrokerUrl, mqttTopic, mqttUsername, mqttPassword, deviceId]
  );

  useEffect(() => {
    // cleanup existing service
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
    // Do not reconnect unless:
    // 1) user clicked start at least once, AND
    // 2) user didn't manually disconnect
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

  // Auto reconnect only after user initiated connect
  useEffect(() => {
    if (!hasUserStartedRef.current) return;

    if (status.state === "disconnected" || status.state === "error") {
      scheduleReconnect();
    }
  }, [status.state, scheduleReconnect]);

  const connect = useCallback(async () => {
    hasUserStartedRef.current = true; // user initiated connection
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

  // OPTIONAL: if you ever want auto-connect in some page, you can pass autoConnect:true
  useEffect(() => {
    if (!autoConnect) return;
    if (hasUserStartedRef.current) return;
    // mark as user-started so reconnect works in this mode
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
    transport
  };
}

function getEnv(key, fallback) {
  let value;

  try {
    if (typeof import.meta !== "undefined" && import.meta.env && key in import.meta.env) {
      value = import.meta.env[key];
    }
  } catch {}

  if ((value == null || String(value).trim() === "") && typeof process !== "undefined" && process.env && key in process.env) {
    value = process.env[key];
  }

  if (value == null || String(value).trim() === "") {
    return fallback;
  }

  return String(value).trim();
}
