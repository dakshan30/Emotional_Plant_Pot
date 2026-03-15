import { useEffect, useState } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement
} from "chart.js";
import { API_BASE } from "../config/api";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

export default function Analytics() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE}/api/plants/history`).then(res => setHistory(res.data));
  }, []);

  const chartData = {
    labels: history.map(item => new Date(item.createdAt).toLocaleTimeString()),
    datasets: [
      {
        label: "Moisture",
        data: history.map(item => item.moisture),
        borderColor: "green"
      }
    ]
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Analytics</h2>
      <Line data={chartData} />
    </div>
  );
}
