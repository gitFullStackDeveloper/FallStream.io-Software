import mongoose from "mongoose";
import ContactSchema from "../Schema/ContactSchema.js";

const Contact = mongoose.model("Contact", ContactSchema);

export default Contact;
