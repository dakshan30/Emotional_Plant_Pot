import { useEffect, useState } from "react";
import axios from "axios";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    const res = await axios.get("http://localhost:5000/api/plants/latest");
    setData(res.data);
  };

  if (!data) return <p>Loading...</p>;

  return (
    <div style={{ padding: 30 }}>
      <h2>Live Dashboard</h2>
      <h3>Emotion: {data.emotion}</h3>
      <p>Moisture: {data.moisture}%</p>
      <p>Temperature: {data.temperature} °C</p>
      <p>Light: {data.light}</p>
    </div>
  );
}
