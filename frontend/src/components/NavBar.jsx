import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav style={{ padding: 20, background: "#0f172a", color: "white" }}>
      <Link to="/" style={{ marginRight: 20, color: "white" }}>Home</Link>
      <Link to="/dashboard" style={{ marginRight: 20, color: "white" }}>Dashboard</Link>
      <Link to="/analytics" style={{ marginRight: 20, color: "white" }}>Analytics</Link>
      <Link to="/history" style={{ color: "white" }}>History</Link>
    </nav>
  );
}
