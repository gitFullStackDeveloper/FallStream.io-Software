import mongoose from "mongoose";
import ReviewSchema from "../Schema/ReviewSchema.js";

const Review = mongoose.model("Review", ReviewSchema);

export default Review;
