import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["new", "reviewed"], default: "new" },
});

export default FeedbackSchema;
