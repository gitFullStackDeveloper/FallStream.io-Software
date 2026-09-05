import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Invalid email"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 500 },
    profile_image: { type: String, default: "" },
    isBlocked: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // Verification fields
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    verificationCodeExpires: { type: Date, default: null },

    // ═══ NEW: Onboarding fields ═══
    onboardingCompleted: { type: Boolean, default: false },
    dateOfBirth: { type: String, default: "" },
    occupation: { type: String, default: "" },
    heardFrom: { type: String, default: "" },
    agreedToPolicy: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const User = mongoose.model("User", UserSchema);
export default User;
