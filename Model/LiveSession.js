import mongoose from "mongoose";

const liveSessionSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  mode: {
    type: String,
    enum: ["public", "private"],
    default: "public",
  },
  password: {
    type: String,
    default: "",
  },
  // Private mode: list of access codes
  accessCodes: [
    {
      code: String,
      label: String, // e.g., "Student 1", "Arham"
      isUsed: { type: Boolean, default: false },
      usedAt: Date,
    },
  ],
  status: {
    type: String,
    enum: ["scheduled", "live", "ended"],
    default: "scheduled",
  },
  scheduledAt: {
    type: Date,
    default: null,
  },
  scheduledEndAt: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  viewerCount: {
    type: Number,
    default: 0,
  },
  chatMessages: [
    {
      userId: String,
      userName: String,
      message: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  recordingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recording",
    default: null,
  },
  startedAt: Date,
  endedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("LiveSession", liveSessionSchema);
