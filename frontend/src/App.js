import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Navbar from "./components/NavBar";
import History from "./pages/History";
import { DeviceConnectionProvider } from "./context/DeviceConnectionProvider";

function App() {
  return (
    <Router>
      <DeviceConnectionProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </DeviceConnectionProvider>
    </Router>
  );
}

export default App;