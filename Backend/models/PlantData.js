import mongoose from "mongoose";

const plantSchema = new mongoose.Schema({
  moisture: Number,
  temperature: Number,
  light: Number,
  emotion: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("PlantData", plantSchema);
