import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, required: true },
  userRole: { type: String, default: "User" },
  avatar: { type: String, default: "" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, required: true, maxlength: 500 },
  isApproved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default ReviewSchema;
