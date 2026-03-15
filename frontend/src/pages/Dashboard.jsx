import { motion } from "framer-motion";
import { useDevice } from "../context/DeviceConnectionProvider";
import "./Dashboard.css";

export default function Dashboard() {
  const { data, status, isConnected, isConnecting, mockMode, transport } = useDevice();

  const emotionText = (data.emotion || "happy").toUpperCase();
  const lightValue = data.light_state || `${data.light} lux`;

  return (
    <div className="dash">
      <div className="dashPattern" aria-hidden="true" />
      <main className="dashContainer">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="dashHeader"
        >
          <h1 className="dashTitle">Live Dashboard</h1>
          <div className="dashSub">
            Status:{" "}
            <span className={`dashPill ${status.state}`}>
              {isConnecting ? "Connecting" : isConnected ? "Connected" : status.state}
            </span>{" "}
            • Mode: {mockMode ? "Mock" : transport.toUpperCase()}
          </div>
        </motion.div>

        <section className="dashGrid">
          <Card title="Moisture" value={`${data.moisture}%`} hint="Soil moisture" />
          <Card title="Temperature" value={`${data.temperature}°C`} hint="Ambient temperature" />
          <Card title="Humidity" value={`${data.humidity}%`} hint="Air humidity" />
          <Card title="Light" value={lightValue} hint="Light condition" />
          <Card title="Emotion" value={emotionText} hint="From ESP32" />
        </section>

        <section className="dashFooter">
          <div className="dashNote">
            {mockMode
              ? "You are currently running in static mock mode."
              : "Live telemetry from ESP32 REST API."}
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ title, value, hint }) {
  return (
    <motion.div
      className="dashCard"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 240, damping: 18 }}
    >
      <div className="dashCardTitle">{title}</div>
      <div className="dashCardValue">{value}</div>
      <div className="dashCardHint">{hint}</div>
    </motion.div>
  );
}