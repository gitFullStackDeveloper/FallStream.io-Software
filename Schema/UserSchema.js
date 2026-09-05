import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
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
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 500 },
    profile_image: { type: String, default: "" },
    isBlocked: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true },
);

export default UserSchema;
