import { useEffect, useState } from "react";
import axios from "axios";

export default function History() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:5000/api/plants/history")
      .then(res => setHistory(res.data));
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h2>History</h2>
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Date</th>
            <th>Moisture</th>
            <th>Temperature</th>
            <th>Light</th>
            <th>Emotion</th>
          </tr>
        </thead>
        <tbody>
          {history.map(item => (
            <tr key={item._id}>
              <td>{new Date(item.createdAt).toLocaleString()}</td>
              <td>{item.moisture}</td>
              <td>{item.temperature}</td>
              <td>{item.light}</td>
              <td>{item.emotion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
