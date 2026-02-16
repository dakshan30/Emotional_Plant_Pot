import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import PlantPot3D from "../pages/PlantPot3D";
import { useDevice } from "../context/DeviceConnectionProvider";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  const { data, status, lastError, connect, isConnecting, isConnected, transport, mockMode } =
    useDevice();

  const mood = useMemo(() => {
    if (data.moisture < 30) return { label: "Thirsty", hint: "Needs water soon" };
    if (data.temperature > 34) return { label: "Too Hot", hint: "Move to a cooler spot" };
    if (data.light < 220) return { label: "Too Dark", hint: "Increase sunlight" };
    return { label: "Happy", hint: "All conditions look great" };
  }, [data.moisture, data.temperature, data.light]);

  const onStartMonitoring = async () => {
    try {
      await connect();
    } catch {
      // UI will show error via status/lastError + auto retry
    }
  };

  const onViewDashboard = () => navigate("/dashboard");

  return (
    <div className="home">
      <div className="pattern" aria-hidden="true" />

      <main className="container">
        <section className="hero" aria-label="Emotional Plant Pot hero">
          <motion.div
            className="left"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="badge">
              <span className="dot" />
              Live IoT Monitoring
              <span className="badgeMeta">{mockMode ? "Mock Mode" : transport.toUpperCase()}</span>
            </div>

            <h1 className="title">Emotional Plant Pot</h1>

            <p className="subtitle">
              An IoT-based interactive smart plant pot that continuously monitors{" "}
              <span className="emph">moisture</span>, <span className="emph">temperature</span>, and{" "}
              <span className="emph">light</span>—helping you care for your plants with calm, clear
              guidance.
            </p>

            <ConnectionPill status={status} error={lastError} />

            <div className="actions">
              <motion.button
                className="btn btnPrimary"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onViewDashboard}
              >
                View Live Dashboard
              </motion.button>

              <motion.button
                className="btn btnSecondary"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStartMonitoring}
                disabled={isConnecting || isConnected}
                aria-busy={isConnecting}
              >
                {isConnecting ? (
                  <span className="btnInline">
                    <Spinner />
                    Connecting…
                  </span>
                ) : isConnected ? (
                  "Monitoring Active"
                ) : (
                  "Start Monitoring"
                )}
              </motion.button>
            </div>

            <div className="mood">
              <div className="moodLabel">{mood.label}</div>
              <div className="moodHint">{mood.hint}</div>
            </div>
          </motion.div>

          <motion.div
            className="right"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="plantStage">
              <PlantPot3D mood={mood.label} />
            </div>

            <div className="stats" role="group" aria-label="Live readings">
              <MiniStat label="Moisture" value={`${data.moisture}%`} />
              <MiniStat label="Temperature" value={`${data.temperature}°C`} />
              <MiniStat label="Light" value={`${data.light} lux`} />
            </div>

            <div className="finePrint">
              {mockMode
                ? "Static demo: telemetry is simulated. Flip env variables later to connect to ESP32/ESP8266."
                : "Real-time telemetry from your device."}
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <motion.div
      className="statCard"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 250, damping: 18 }}
    >
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </motion.div>
  );
}

function ConnectionPill({ status, error }) {
  const view = getStatusView(status);

  return (
    <div className={`connPill conn-${view.tone}`} role="status" aria-live="polite">
      <span className="connDot" aria-hidden="true" />
      <div className="connText">
        <div className="connTitle">{view.title}</div>
        <div className="connDetail">
          {status?.detail || view.detail}
          {view.tone === "error" && error?.message ? ` — ${error.message}` : ""}
        </div>
      </div>
    </div>
  );
}

function getStatusView(status) {
  switch (status?.state) {
    case "connected":
      return { tone: "ok", title: "Device Connected", detail: "Receiving live telemetry" };
    case "connecting":
      return { tone: "wait", title: "Connecting", detail: "Attempting to reach your device…" };
    case "error":
      return { tone: "error", title: "Connection Error", detail: "Could not connect (auto-retrying)" };
    case "disconnected":
      return { tone: "muted", title: "Disconnected", detail: "Not connected to device" };
    default:
      return { tone: "muted", title: "Idle", detail: "Click Start Monitoring to connect" };
  }
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}