import { Link, NavLink } from "react-router-dom";
import { useDevice } from "../context/DeviceConnectionProvider";
import "./NavBar.css";

export default function Navbar() {
  const { status, isConnected, isConnecting, connect, mockMode, transport } = useDevice();

  const onStart = async () => {
    try {
      await connect();
    } catch {
      // status + error UI handled by indicator; auto-reconnect handled in hook
    }
  };

  const indicator = getIndicator(status, isConnected, isConnecting);

  return (
    <header className="navHeader">
      <nav className="navBar" aria-label="Primary">
        {/* Brand */}
        <Link to="/" className="navBrand">
          <span className="navBrandDot" aria-hidden="true" />
          Emotional Plant Pot
        </Link>

        {/* Center rounded tab */}
        <div className="navTabs" role="navigation" aria-label="Pages">
          <NavLink to="/" end className={({ isActive }) => `navTab ${isActive ? "isActive" : ""}`}>
            Home
          </NavLink>

          <NavLink
            to="/dashboard"
            className={({ isActive }) => `navTab ${isActive ? "isActive" : ""}`}
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/analytics"
            className={({ isActive }) => `navTab ${isActive ? "isActive" : ""}`}
          >
            Analytics
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => `navTab ${isActive ? "isActive" : ""}`}
          >
            History
          </NavLink>
        </div>

        {/* Right side: status + start button */}
        <div className="navRight">
          <div className={`navConn navConn-${indicator.tone}`} role="status" aria-live="polite">
            <span className="navConnDot" aria-hidden="true" />
            <div className="navConnText">
              <div className="navConnTitle">{indicator.title}</div>
              <div className="navConnMeta">
                {mockMode ? "Mock" : transport.toUpperCase()}
              </div>
            </div>
          </div>

          <button
            className="navGhostBtn"
            onClick={onStart}
            disabled={isConnecting || isConnected}
            aria-busy={isConnecting}
            type="button"
          >
            {isConnecting ? (
              <span className="navBtnInline">
                <span className="navSpinner" aria-hidden="true" />
                Connecting
              </span>
            ) : isConnected ? (
              "Connected"
            ) : (
              "Start"
            )}
          </button>
        </div>
      </nav>
    </header>
  );
}

function getIndicator(status, isConnected, isConnecting) {
  if (isConnecting) return { tone: "wait", title: "Connecting" };
  if (isConnected) return { tone: "ok", title: "Device Online" };

  switch (status?.state) {
    case "error":
      return { tone: "error", title: "Retrying" };
    case "disconnected":
      return { tone: "muted", title: "Offline" };
    default:
      return { tone: "muted", title: "Idle" };
  }
}