import { motion } from "framer-motion";
import "./PlantPot3D.css";

/**
 * Lightweight “3D-ish” cartoon pot built with pure CSS (no Three.js),
 * animated subtly with Framer Motion for a premium SaaS feel.
 */
export default function PlantPot3D({ mood = "Happy" }) {
  const glow = moodToGlow(mood);

  return (
    <motion.div
      className="potWrap"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="float"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="glow" style={{ background: glow }} />

        {/* Leaves */}
        <motion.div
          className="leaves"
          animate={{ rotate: [0, 1.2, 0, -1.2, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="leaf leaf1" />
          <div className="leaf leaf2" />
          <div className="leaf leaf3" />
        </motion.div>

        {/* Stem */}
        <div className="stem" />

        {/* Pot */}
        <div className="pot">
          <div className="potLip" />
          <div className="potBody" />
          <div className="potShadow" />
        </div>
      </motion.div>

      <div className="caption">
        <span className="capTitle">{mood}</span>
        <span className="capSub">Subtle emotional feedback</span>
      </div>
    </motion.div>
  );
}

function moodToGlow(mood) {
  switch (mood) {
    case "Thirsty":
      return "radial-gradient(circle at 50% 60%, rgba(59,130,246,0.35), rgba(59,130,246,0.0) 62%)";
    case "Too Hot":
      return "radial-gradient(circle at 50% 60%, rgba(239,68,68,0.32), rgba(239,68,68,0.0) 62%)";
    case "Too Dark":
      return "radial-gradient(circle at 50% 60%, rgba(99,102,241,0.28), rgba(99,102,241,0.0) 62%)";
    default:
      return "radial-gradient(circle at 50% 60%, #0b1f3a38, rgba(11,31,58,0.0) 62%)";
  }
}