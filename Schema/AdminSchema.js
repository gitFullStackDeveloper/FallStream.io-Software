import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Invalid email"],
    },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, default: "admin" },
    profile_image: { type: String, default: "" },
  },
  { timestamps: true },
);

export default AdminSchema;
