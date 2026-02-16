import express from "express";
import PlantData from "../models/PlantData.js";

const router = express.Router();

// Add new reading (ESP32 POST here)
router.post("/", async (req, res) => {
  try {
    const { moisture, temperature, light } = req.body;

    let emotion = "Happy";

    if (moisture < 30) emotion = "Thirsty";
    else if (moisture > 80) emotion = "Overwatered";
    else if (temperature > 35) emotion = "Too Hot";
    else if (light < 200) emotion = "Too Dark";

    const data = await PlantData.create({
      moisture,
      temperature,
      light,
      emotion
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get latest reading
router.get("/latest", async (req, res) => {
  const data = await PlantData.findOne().sort({ createdAt: -1 });
  res.json(data);
});

// Get all history
router.get("/history", async (req, res) => {
  const data = await PlantData.find().sort({ createdAt: -1 });
  res.json(data);
});

export default router;
