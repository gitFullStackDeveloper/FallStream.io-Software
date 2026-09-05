import mongoose from "mongoose";
import SharedLinkSchema from "../Schema/SharedLinkSchema.js";

const SharedLink = mongoose.model("SharedLink", SharedLinkSchema);

export default SharedLink;
