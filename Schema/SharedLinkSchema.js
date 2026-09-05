import mongoose from "mongoose";

const SharedLinkSchema = new mongoose.Schema({
  recordingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recording",
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true },
  password: { type: String, default: "" },
  expiryDays: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["active", "blocked"], default: "active" },
  views: [
    {
      name: String,
      email: String,
      viewedAt: { type: Date, default: Date.now },
    },
  ],
});

export default SharedLinkSchema;
