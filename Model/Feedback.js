import mongoose from "mongoose";
import FeedbackSchema from "../Schema/FeedbackSchema.js";

const Feedback = mongoose.model("Feedback", FeedbackSchema);

export default Feedback;
