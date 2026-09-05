import mongoose from "mongoose";

const RecordingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  duration: { type: Number, required: true },
  size: { type: Number, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, default: "video/webm" },
  createdAt: { type: Date, default: Date.now },
});

export default RecordingSchema;
