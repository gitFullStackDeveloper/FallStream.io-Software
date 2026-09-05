import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true },
  subject: { type: String, default: "" },
  message: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ["new", "replied"], default: "new" },
  replyMessage: { type: String, default: "" },
  repliedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default ContactSchema;
