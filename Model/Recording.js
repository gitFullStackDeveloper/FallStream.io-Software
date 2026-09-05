import mongoose from "mongoose";
import RecordingSchema from "../Schema/RecordingSchema.js";

const Recording = mongoose.model("Recording", RecordingSchema);

export default Recording;
