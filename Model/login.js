// Models/login.js
import mongoose from "mongoose";
import UserSchema from "../Schema/login.js";

const User = mongoose.model("User", UserSchema);
export default User;
