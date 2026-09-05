import mongoose from "mongoose";
import AdminSchema from "../Schema/AdminSchema.js";

const Admin = mongoose.model("Admin", AdminSchema);

export default Admin;
