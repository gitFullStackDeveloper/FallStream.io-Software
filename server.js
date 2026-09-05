import "dotenv/config";
import crypto from "crypto";
import http from "http";
import fs from "fs";
import path from "path";
import url from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import busboy from "busboy";

// ========== CONFIGURATION (from .env) ==========
const PORT = process.env.PORT || 5000;
// const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:Arham.116@leadgenerationengine.px4fqe7.mongodb.net/?appName=LeadGenerationEngine/screenrecorder';
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://admin:Arham.116@leadgenerationengine.px4fqe7.mongodb.net/screenrecorder?retryWrites=true&w=majority&appName=LeadGenerationEngine";
const JWT_SECRET = process.env.JWT_SECRET || "my_super_secret_key_change_this";

// ========== IMPORT MODELS ==========
import LiveSession from "./Model/LiveSession.js";
import Admin from "./Model/Admin.js";
import Review from "./Model/Review.js";
import User from "./Model/User.js";
import Recording from "./Model/Recording.js";
import SharedLink from "./Model/SharedLink.js";
import Feedback from "./Model/Feedback.js";
import Contact from "./Model/Contact.js";

// ========== MIME TYPES ==========
const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ========== HELPERS ==========
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || "application/octet-stream";
  try {
    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404);
      res.end("<h1>404 - Not Found</h1>");
    } else {
      res.writeHead(500);
      res.end("Server Error");
    }
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0].trim();
    const value = parts[1] ? parts[1].trim() : "";
    cookies[name] = value;
  });
  return cookies;
}

function verifyToken(req) {
  const authHeader = req.headers["authorization"];
  let token = null;

  if (authHeader) {
    token = authHeader.split(" ")[1];
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.adminToken || cookies.token;
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.adminId && !decoded.userId) {
      decoded.userId = decoded.adminId;
    }
    return decoded;
  } catch {
    return null;
  }
}

function requireAuth(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return null;
  }
  return decoded;
}

async function handleSignup(req, res) {
  try {
    const { name, email, password } = await parseBody(req);
    if (!name || !email || !password)
      return sendJSON(res, 400, { message: "All fields required" });
    if (await User.findOne({ email }))
      return sendJSON(res, 400, { message: "Email already registered" });
    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(10),
    );
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
    });

    // Generate verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const expiryMinutes = parseInt(process.env.VERIFICATION_CODE_EXPIRY) || 10;
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = new Date(
      Date.now() + expiryMinutes * 60 * 1000,
    );
    await user.save();

    // Code will be sent via browser from verify-email page
    console.log("📋 Verification code generated:", verificationCode);

    sendJSON(res, 201, {
      message: "Account created! Please verify your email.",
      userId: user._id,
      email: user.email,
      requiresVerification: true,
    });
  } catch (error) {
    console.error("❌ Signup error:", error);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleLogin(req, res) {
  try {
    const { email, password } = await parseBody(req);

    // Validation
    if (!email || !password) {
      return sendJSON(res, 400, {
        message: "Email and password are required.",
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return sendJSON(res, 401, {
        message: "No account found with this email. Please sign up first.",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return sendJSON(res, 401, {
        message: "Incorrect password. Please try again.",
      });
    }

    // Check if blocked
    if (user.isBlocked) {
      return sendJSON(res, 403, {
        message: "Your account has been suspended. Please contact support.",
      });
    }

    // Check if verified
    if (!user.isVerified) {
      return sendJSON(res, 403, {
        message: "Please verify your email before logging in.",
        requiresVerification: true,
        email: user.email,
      });
    }

    // Success - create token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.setHeader(
      "Set-Cookie",
      `token=${token}; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; Path=/; SameSite=Lax`,
    );

    sendJSON(res, 200, {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        address: user.address || "",
        bio: user.bio || "",
        profile_image: user.profile_image || "",
        createdAt: user.createdAt,
        onboardingCompleted: user.onboardingCompleted || false,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    sendJSON(res, 500, { message: "Server error. Please try again later." });
  }
}

// ========== PROFILE HANDLERS ==========
async function handleGetProfile(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  const user = await User.findById(decoded.userId).select("-password");
  sendJSON(res, 200, { user });
}

async function handleUpdateProfile(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const { name, email, phone, address, bio, profile_image } =
      await parseBody(req); // ← Add profile_image
    if (!name || !email)
      return sendJSON(res, 400, { message: "Name and email required" });
    const existing = await User.findOne({
      email,
      _id: { $ne: decoded.userId },
    });
    if (existing)
      return sendJSON(res, 400, { message: "Email already in use" });

    const updateData = {
      name,
      email,
      phone: phone || "",
      address: address || "",
      bio: bio || "",
    };
    if (profile_image) updateData.profile_image = profile_image; // ← Save image if provided

    const updated = await User.findByIdAndUpdate(decoded.userId, updateData, {
      returnDocument: "after",
    }).select("-password");
    sendJSON(res, 200, { message: "Profile updated", user: updated });
  } catch (e) {
    sendJSON(res, 500, { message: "Server error" });
  }
}
async function handleChangePassword(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const { current_password, password, password_confirmation } =
      await parseBody(req);
    if (!current_password || !password)
      return sendJSON(res, 400, { message: "All fields required" });
    if (password !== password_confirmation)
      return sendJSON(res, 400, { message: "Passwords do not match" });
    if (password.length < 8)
      return sendJSON(res, 400, {
        message: "Password must be at least 8 characters",
      });
    const user = await User.findById(decoded.userId);
    if (!(await bcrypt.compare(current_password, user.password)))
      return sendJSON(res, 401, { message: "Current password incorrect" });
    user.password = await bcrypt.hash(password, await bcrypt.genSalt(10));
    await user.save();
    sendJSON(res, 200, { message: "Password updated" });
  } catch (e) {
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== RECORDING HANDLERS ==========
async function handleUploadRecording(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  const query = url.parse(req.url, true).query;
  const title = query.title || "Untitled";
  const duration = parseInt(query.duration) || 0;
  const userDir = path.join(
    process.cwd(),
    "Views",
    "recordings",
    decoded.userId,
  );
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  const filename = `rec_${Date.now()}.webm`;
  const filePath = path.join(userDir, filename);
  const writeStream = fs.createWriteStream(filePath);
  let fileSize = 0;
  let mimeType = "video/webm";
  const bb = busboy({ headers: req.headers });
  bb.on("file", (fieldname, file, info) => {
    if (fieldname !== "video") return file.resume();
    mimeType = info.mimeType || "video/webm";
    file.on("data", (chunk) => {
      fileSize += chunk.length;
    });
    file.pipe(writeStream);
  });
  bb.on("finish", async () => {
    try {
      const recording = await Recording.create({
        userId: decoded.userId,
        title,
        duration,
        size: fileSize,
        filename,
        mimeType,
      });
      sendJSON(res, 201, { message: "Recording saved", recording });
    } catch (e) {
      console.error(e);
      fs.unlink(filePath, () => {});
      sendJSON(res, 500, { message: "Database error" });
    }
  });
  bb.on("error", (err) => {
    console.error("Busboy error:", err);
    fs.unlink(filePath, () => {});
    sendJSON(res, 500, { message: "Upload failed" });
  });
  req.pipe(bb);
}

async function handleGetRecordings(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  const recordings = await Recording.find({ userId: decoded.userId }).sort(
    "-createdAt",
  );
  sendJSON(res, 200, recordings);
}

async function handleDownloadRecording(req, res) {
  const id = req.url.split("/").pop().split("?")[0];
  const query = url.parse(req.url, true).query;
  const shareToken = query.token || "";

  // First, try authenticated user
  const decoded = verifyToken(req);

  if (decoded) {
    const recording = await Recording.findOne({
      _id: id,
      userId: decoded.userId,
    });
    if (recording) {
      const filePath = path.join(
        process.cwd(),
        "Views",
        "recordings",
        decoded.userId,
        recording.filename,
      );
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("File missing");
        return;
      }
      res.writeHead(200, {
        "Content-Type": recording.mimeType || "video/webm",
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // If no auth, check share token
  if (shareToken) {
    const sharedLink = await SharedLink.findOne({
      token: shareToken,
      status: { $ne: "blocked" },
    });
    if (sharedLink) {
      if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt) {
        res.writeHead(410);
        res.end("Link expired");
        return;
      }
      const recording = await Recording.findById(id);
      if (recording) {
        const filePath = path.join(
          process.cwd(),
          "Views",
          "recordings",
          recording.userId.toString(),
          recording.filename,
        );
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("File missing");
          return;
        }
        res.writeHead(200, {
          "Content-Type": recording.mimeType || "video/webm",
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
  }

  // Also check if recording exists for any user (public share without token)
  if (!decoded && !shareToken) {
    const recording = await Recording.findById(id);
    if (recording) {
      // Check if there's an active share link for this recording
      const activeLink = await SharedLink.findOne({
        recordingId: id,
        status: "active",
      });
      if (activeLink) {
        const filePath = path.join(
          process.cwd(),
          "Views",
          "recordings",
          recording.userId.toString(),
          recording.filename,
        );
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("File missing");
          return;
        }
        res.writeHead(200, {
          "Content-Type": recording.mimeType || "video/webm",
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
  }

  res.writeHead(401);
  res.end("Unauthorized");
}

async function handleDeleteRecording(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  const id = req.url.split("/").pop();
  const recording = await Recording.findOne({
    _id: id,
    userId: decoded.userId,
  });
  if (!recording) return sendJSON(res, 404, { message: "Not found" });
  const filePath = path.join(
    process.cwd(),
    "Views",
    "recordings",
    decoded.userId,
    recording.filename,
  );
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await Recording.deleteOne({ _id: id });
  sendJSON(res, 200, { message: "Deleted" });
}

async function handleRenameRecording(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  const id = req.url.split("/").pop();
  if (!id) return sendJSON(res, 400, { message: "Missing recording ID" });
  try {
    const body = await parseBody(req);
    const newTitle = body.title?.trim();
    if (!newTitle) return sendJSON(res, 400, { message: "Title is required" });
    const recording = await Recording.findOne({
      _id: id,
      userId: decoded.userId,
    });
    if (!recording)
      return sendJSON(res, 404, { message: "Recording not found" });
    recording.title = newTitle;
    await recording.save();
    sendJSON(res, 200, recording);
  } catch (error) {
    console.error("Rename error:", error);
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== FEEDBACK HANDLERS ==========
async function handleSubmitFeedback(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const { message } = await parseBody(req);
    if (!message || !message.trim())
      return sendJSON(res, 400, { message: "Message required" });
    const user = await User.findById(decoded.userId);
    const feedback = await Feedback.create({
      userId: user._id,
      userName: user.name,
      email: user.email,
      message: message.trim(),
    });
    sendJSON(res, 201, { message: "Feedback submitted", feedback });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminGetFeedback(req, res) {
  try {
    const feedbacks = await Feedback.find().sort("-createdAt");
    sendJSON(res, 200, feedbacks);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminDeleteFeedback(req, res, feedbackId) {
  try {
    const fb = await Feedback.findByIdAndDelete(feedbackId);
    if (!fb) return sendJSON(res, 404, { message: "Not found" });
    sendJSON(res, 200, { message: "Deleted" });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== CONTACT HANDLERS ==========
async function handleSubmitContact(req, res) {
  try {
    const body = await parseBody(req);
    const { name, email, subject, message } = body;
    if (!name || !email || !message)
      return sendJSON(res, 400, {
        message: "Name, email and message are required",
      });
    const contact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject ? subject.trim() : "",
      message: message.trim(),
    });
    sendJSON(res, 201, { message: "Message received", contact });
  } catch (err) {
    console.error("Contact error:", err);
    sendJSON(res, 500, { message: "Server error: " + err.message });
  }
}

async function handleAdminGetContacts(req, res) {
  const queryParams = url.parse(req.url, true).query;
  const filter = {};
  if (queryParams.date) {
    const dayStart = new Date(queryParams.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    filter.createdAt = { $gte: dayStart, $lt: dayEnd };
  }
  try {
    const contacts = await Contact.find(filter).sort("-createdAt");
    sendJSON(res, 200, contacts);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminGetContact(req, res, contactId) {
  try {
    const contact = await Contact.findById(contactId);
    if (!contact) return sendJSON(res, 404, { message: "Not found" });
    sendJSON(res, 200, contact);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminUpdateContact(req, res, contactId) {
  try {
    const body = await parseBody(req);
    const { replyMessage, status } = body;
    const updateData = {};
    if (replyMessage !== undefined) {
      updateData.replyMessage = replyMessage;
      updateData.repliedAt = new Date();
      updateData.status = "replied";
    }
    if (status && status !== "replied" && !replyMessage)
      updateData.status = status;
    const contact = await Contact.findByIdAndUpdate(contactId, updateData, {
      returnDocument: "after",
    });
    if (!contact) return sendJSON(res, 404, { message: "Not found" });
    sendJSON(res, 200, contact);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminDeleteContact(req, res, contactId) {
  try {
    const contact = await Contact.findByIdAndDelete(contactId);
    if (!contact) return sendJSON(res, 404, { message: "Not found" });
    sendJSON(res, 200, { message: "Deleted" });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== ADMIN: GET ALL USERS ==========
async function handleAdminGetUsers(req, res) {
  const queryParams = url.parse(req.url, true).query;
  const filter = {};
  if (queryParams.date) {
    const dayStart = new Date(queryParams.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    filter.createdAt = { $gte: dayStart, $lt: dayEnd };
  } else if (queryParams.month) {
    const [year, month] = queryParams.month.split("-");
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    filter.createdAt = { $gte: monthStart, $lt: monthEnd };
  } else if (queryParams.year) {
    const numYear = parseInt(queryParams.year);
    const yearStart = new Date(numYear, 0, 1);
    const yearEnd = new Date(numYear + 1, 0, 1);
    filter.createdAt = { $gte: yearStart, $lt: yearEnd };
  }
  if (queryParams.search) {
    const searchRegex = new RegExp(queryParams.search, "i");
    filter.$or = [{ name: searchRegex }, { email: searchRegex }];
  }
  try {
    const users = await User.find(filter)
      .select("-password")
      .sort("-createdAt");
    sendJSON(res, 200, users);
  } catch (err) {
    console.error("Admin users fetch error:", err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminGetUser(req, res, userId) {
  try {
    const user = await User.findById(userId).select("+password");
    if (!user) return sendJSON(res, 404, { message: "User not found" });
    sendJSON(res, 200, user);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminUpdateUser(req, res, userId) {
  try {
    const body = await parseBody(req);
    const { name, email, phone, address, bio, isAdmin, isBlocked, password } =
      body;
    if (!name || !email)
      return sendJSON(res, 400, { message: "Name and email required" });
    const updateData = {
      name,
      email,
      phone: phone || "",
      address: address || "",
      bio: bio || "",
    };
    if (typeof isAdmin === "boolean") updateData.isAdmin = isAdmin;
    if (typeof isBlocked === "boolean") updateData.isBlocked = isBlocked;
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    const updated = await User.findByIdAndUpdate(userId, updateData, {
      returnDocument: "after",
    }).select("-password");
    if (!updated) return sendJSON(res, 404, { message: "User not found" });
    sendJSON(res, 200, updated);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminDeleteUser(req, res, userId) {
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) return sendJSON(res, 404, { message: "User not found" });
    sendJSON(res, 200, { message: "User deleted" });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminToggleBlock(req, res, userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return sendJSON(res, 404, { message: "User not found" });
    user.isBlocked = !user.isBlocked;
    await user.save();
    sendJSON(res, 200, { isBlocked: user.isBlocked });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== ADMIN AUTH ROUTES ==========
async function handleAdminLogin(req, res) {
  try {
    const { email, password } = await parseBody(req);
    if (!email || !password)
      return sendJSON(res, 400, { message: "Email and password required" });
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await bcrypt.compare(password, admin.password)))
      return sendJSON(res, 401, {
        message: "Invalid credentials or not an admin",
      });

    const token = jwt.sign(
      {
        adminId: admin._id,
        userId: admin._id,
        email: admin.email,
        isAdmin: true,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.setHeader(
      "Set-Cookie",
      `adminToken=${token}; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; Path=/; SameSite=Lax`,
    );

    console.log(
      "✅ Admin logged in, token set:",
      token.substring(0, 20) + "...",
    );

    sendJSON(res, 200, {
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "admin",
        profile_image: admin.profile_image || "",
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleGetAdmins(req, res) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.isAdmin)
    return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const admins = await Admin.find().select("-password");
    sendJSON(res, 200, admins);
  } catch (err) {
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleCreateAdmin(req, res) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.isAdmin)
    return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount >= 3)
      return sendJSON(res, 400, {
        message: "Maximum 3 admin accounts allowed",
      });
    const { name, email, password } = await parseBody(req);
    if (!name || !email || !password)
      return sendJSON(res, 400, { message: "All fields required" });
    if (password.length < 6)
      return sendJSON(res, 400, {
        message: "Password must be at least 6 characters",
      });
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing)
      return sendJSON(res, 400, { message: "Email already registered" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const admin = await Admin.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    });
    sendJSON(res, 201, {
      message: "Admin created!",
      admin: { id: admin._id, name: admin.name, email: admin.email },
    });
  } catch (err) {
    console.error("Create admin error:", err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleAdminChangePassword(req, res) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.isAdmin)
    return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    const { currentPassword, newPassword } = await parseBody(req);
    if (!currentPassword || !newPassword)
      return sendJSON(res, 400, { message: "All fields required" });
    if (newPassword.length < 6)
      return sendJSON(res, 400, {
        message: "Password must be at least 6 characters",
      });
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) return sendJSON(res, 404, { message: "Admin not found" });
    if (!(await bcrypt.compare(currentPassword, admin.password)))
      return sendJSON(res, 401, { message: "Current password incorrect" });
    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(newPassword, salt);
    await admin.save();
    sendJSON(res, 200, { message: "Password updated!" });
  } catch (err) {
    console.error("Change password error:", err);
    sendJSON(res, 500, { message: "Server error" });
  }
}

async function handleDeleteAdmin(req, res, adminId) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.isAdmin)
    return sendJSON(res, 401, { message: "Unauthorized" });
  try {
    if (adminId === decoded.adminId)
      return sendJSON(res, 400, { message: "Cannot delete yourself" });
    const adminCount = await Admin.countDocuments();
    if (adminCount <= 1)
      return sendJSON(res, 400, { message: "Must have at least 1 admin" });
    await Admin.findByIdAndDelete(adminId);
    sendJSON(res, 200, { message: "Admin removed" });
  } catch (err) {
    sendJSON(res, 500, { message: "Server error" });
  }
}

// ========== HTTP SERVER ==========
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  // API routes

  if (pathname === "/api/signup" && method === "POST")
    return handleSignup(req, res);
  if (pathname === "/api/login" && method === "POST")
    return handleLogin(req, res);
  // ═══════════════ ONBOARDING ROUTE ═══════════════
  if (pathname === "/api/onboarding" && method === "POST") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    try {
      const { dateOfBirth, occupation, heardFrom, agreedToPolicy } =
        await parseBody(req);

      const user = await User.findByIdAndUpdate(
        decoded.userId,
        {
          dateOfBirth: dateOfBirth || "",
          occupation: occupation || "",
          heardFrom: heardFrom || "",
          agreedToPolicy: agreedToPolicy || false,
          onboardingCompleted: true,
        },
        { returnDocument: "after" },
      ).select("-password");

      if (!user) return sendJSON(res, 404, { message: "User not found" });

      sendJSON(res, 200, {
        message: "Onboarding completed!",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          onboardingCompleted: user.onboardingCompleted,
        },
      });
    } catch (err) {
      console.error("Onboarding error:", err);
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // ═══════════════ EMAIL VERIFICATION ROUTES ═══════════════

  // Send verification code (returns code for browser to email)
  if (pathname === "/api/send-verification" && method === "POST") {
    try {
      const { email } = await parseBody(req);
      if (!email) return sendJSON(res, 400, { message: "Email is required" });

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user)
        return sendJSON(res, 404, {
          message: "No account found with this email",
        });

      if (user.isVerified)
        return sendJSON(res, 400, {
          message: "Account already verified. Please login.",
        });

      // Generate 6-digit code
      const verificationCode = Math.floor(
        100000 + Math.random() * 900000,
      ).toString();
      const expiryMinutes =
        parseInt(process.env.VERIFICATION_CODE_EXPIRY) || 10;

      user.verificationCode = verificationCode;
      user.verificationCodeExpires = new Date(
        Date.now() + expiryMinutes * 60 * 1000,
      );
      await user.save();

      console.log("📋 Verification code:", verificationCode, "for", email);

      // Return code so frontend can send via Web3Forms
      sendJSON(res, 200, {
        message: "Verification code generated",
        code: verificationCode,
        expiresIn: expiryMinutes,
      });
    } catch (err) {
      console.error("❌ Send verification error:", err);
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }

  // Verify code
  if (pathname === "/api/verify-code" && method === "POST") {
    try {
      const { email, code } = await parseBody(req);
      if (!email || !code)
        return sendJSON(res, 400, {
          message: "Email and verification code are required",
        });

      console.log("🔍 Verifying code:", code, "for email:", email);

      const user = await User.findOne({
        email: email.toLowerCase(),
        verificationCode: code,
        verificationCodeExpires: { $gt: new Date() },
      });

      if (!user) {
        return sendJSON(res, 400, {
          message:
            "Invalid or expired verification code. Please request a new one.",
        });
      }

      // Mark as verified
      user.isVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save();

      console.log("✅ User verified:", email);

      sendJSON(res, 200, {
        message: "Email verified successfully! You can now login.",
        verified: true,
      });
    } catch (err) {
      console.error("❌ Verify code error:", err);
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }

  // Resend verification code
  if (pathname === "/api/resend-verification" && method === "POST") {
    try {
      const { email } = await parseBody(req);
      if (!email) return sendJSON(res, 400, { message: "Email is required" });

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return sendJSON(res, 404, { message: "No account found" });
      if (user.isVerified)
        return sendJSON(res, 400, { message: "Account already verified" });

      const verificationCode = Math.floor(
        100000 + Math.random() * 900000,
      ).toString();
      const expiryMinutes =
        parseInt(process.env.VERIFICATION_CODE_EXPIRY) || 10;

      user.verificationCode = verificationCode;
      user.verificationCodeExpires = new Date(
        Date.now() + expiryMinutes * 60 * 1000,
      );
      await user.save();

      console.log("📋 New verification code:", verificationCode, "for", email);

      sendJSON(res, 200, {
        message: "New verification code generated!",
        code: verificationCode,
        expiresIn: expiryMinutes,
      });
    } catch (err) {
      console.error("❌ Resend error:", err);
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }

  // Forgot Password
  if (pathname === "/api/check-email" && method === "POST") {
    try {
      const { email } = await parseBody(req);
      if (!email) return sendJSON(res, 400, { message: "Email is required" });
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return sendJSON(res, 404, { message: "No account found" });
      sendJSON(res, 200, {
        message: "Email verified",
        user: { name: user.name, email: user.email },
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname === "/api/reset-password" && method === "POST") {
    try {
      const { email, newPassword } = await parseBody(req);
      if (!email || !newPassword)
        return sendJSON(res, 400, {
          message: "Email and new password required",
        });
      if (newPassword.length < 6)
        return sendJSON(res, 400, {
          message: "Password must be at least 6 characters",
        });
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return sendJSON(res, 404, { message: "User not found" });
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();
      sendJSON(res, 200, { message: "Password reset successful" });
    } catch (err) {
      sendJSON(res, 200, {
        message: "Server error",
        code: verificationCode,
      });
    }
    return;
  }

  if (pathname === "/api/profile" && method === "GET")
    return handleGetProfile(req, res);
  if (pathname === "/api/profile" && method === "PUT")
    return handleUpdateProfile(req, res);
  if (pathname === "/api/profile/password" && method === "PUT")
    return handleChangePassword(req, res);

  // Recordings
  if (pathname === "/api/recordings" && method === "GET")
    return handleGetRecordings(req, res);
  if (pathname === "/api/recordings" && method === "POST")
    return handleUploadRecording(req, res);
  if (pathname.startsWith("/api/recordings/download/") && method === "GET")
    return handleDownloadRecording(req, res);
  if (pathname.startsWith("/api/recordings/") && method === "DELETE")
    return handleDeleteRecording(req, res);
  if (pathname.startsWith("/api/recordings/") && method === "PUT")
    return handleRenameRecording(req, res);

  if (pathname === "/api/feedback" && method === "POST")
    return handleSubmitFeedback(req, res);
  if (pathname === "/api/contact" && method === "POST")
    return handleSubmitContact(req, res);

  // Admin contact routes
  if (pathname === "/api/admin/contacts" && method === "GET")
    return handleAdminGetContacts(req, res);
  if (pathname.startsWith("/api/admin/contacts/") && method === "GET") {
    const contactId = pathname.split("/").pop();
    return handleAdminGetContact(req, res, contactId);
  }
  if (pathname.startsWith("/api/admin/contacts/") && method === "PUT") {
    const contactId = pathname.split("/").pop();
    return handleAdminUpdateContact(req, res, contactId);
  }
  if (pathname.startsWith("/api/admin/contacts/") && method === "DELETE") {
    const contactId = pathname.split("/").pop();
    return handleAdminDeleteContact(req, res, contactId);
  }

  // Feedback admin routes
  if (pathname === "/api/admin/feedback" && method === "GET")
    return handleAdminGetFeedback(req, res);
  if (pathname.startsWith("/api/admin/feedback/") && method === "DELETE") {
    const feedbackId = pathname.split("/").pop();
    return handleAdminDeleteFeedback(req, res, feedbackId);
  }
  if (pathname.startsWith("/api/admin/feedback/") && method === "GET") {
    const feedbackId = pathname.split("/").pop();
    try {
      const fb = await Feedback.findById(feedbackId);
      if (!fb) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, fb);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/admin/feedback/") && method === "PUT") {
    const feedbackId = pathname.split("/").pop();
    try {
      const body = await parseBody(req);
      const fb = await Feedback.findByIdAndUpdate(
        feedbackId,
        { status: body.status },
        { returnDocument: "after" },
      );
      if (!fb) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, fb);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // User routes
  if (pathname.startsWith("/api/admin/users/") && method === "GET") {
    const id = pathname.split("/").pop();
    if (id !== "block") return handleAdminGetUser(req, res, id);
  }
  if (pathname.startsWith("/api/admin/users/") && method === "PUT") {
    const parts = pathname.split("/");
    const last = parts.pop();
    if (last === "block") {
      const userId = parts.pop();
      return handleAdminToggleBlock(req, res, userId);
    } else {
      return handleAdminUpdateUser(req, res, last);
    }
  }
  if (pathname.startsWith("/api/admin/users/") && method === "DELETE") {
    const id = pathname.split("/").pop();
    return handleAdminDeleteUser(req, res, id);
  }
  if (pathname === "/api/admin/users" && method === "GET")
    return handleAdminGetUsers(req, res);

  // Protected tool pages
  const protectedPaths = [""];
  if (protectedPaths.includes(pathname)) {
    const user = requireAuth(req, res);
    if (!user) return;
  }

  // Public reviews
  if (pathname === "/api/reviews" && method === "GET") {
    try {
      const reviews = await Review.find({ isApproved: true }).sort(
        "-createdAt",
      );
      sendJSON(res, 200, reviews);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Review admin routes
  if (pathname === "/api/admin/reviews" && method === "GET") {
    try {
      const reviews = await Review.find().sort("-createdAt");
      sendJSON(res, 200, reviews);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname === "/api/admin/reviews" && method === "POST") {
    try {
      const body = await parseBody(req);
      const { userName, userRole, avatar, rating, text } = body;
      if (!userName || !text || !rating)
        return sendJSON(res, 400, {
          message: "Name, text and rating required",
        });
      const review = await Review.create({
        userId: new mongoose.Types.ObjectId(),
        userName,
        userRole: userRole || "User",
        avatar: avatar || "",
        rating,
        text,
        isApproved: true,
      });
      sendJSON(res, 201, review);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (
    pathname.startsWith("/api/admin/reviews/") &&
    method === "PUT" &&
    !pathname.includes("/approve")
  ) {
    const reviewId = pathname.split("/").pop();
    try {
      const body = await parseBody(req);
      const review = await Review.findByIdAndUpdate(reviewId, body, {
        returnDocument: "after",
      });
      if (!review) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, review);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (
    pathname.startsWith("/api/admin/reviews/") &&
    pathname.endsWith("/approve") &&
    method === "PUT"
  ) {
    const reviewId = pathname.split("/")[4];
    try {
      const review = await Review.findByIdAndUpdate(
        reviewId,
        { isApproved: true },
        { returnDocument: "after" },
      );
      if (!review) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, review);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/admin/reviews/") && method === "DELETE") {
    const reviewId = pathname.split("/").pop();
    try {
      await Review.findByIdAndDelete(reviewId);
      sendJSON(res, 200, { message: "Deleted" });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // ═══════════════ SHARE LINK ROUTES ═══════════════
  if (pathname === "/api/share/links" && method === "GET") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    try {
      const links = await SharedLink.find({ userId: decoded.userId })
        .populate("recordingId", "title duration size")
        .sort("-createdAt");
      sendJSON(res, 200, links);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname === "/api/share/generate" && method === "POST") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    try {
      const { recordingId, expiryDays, password } = await parseBody(req);
      if (!recordingId)
        return sendJSON(res, 400, { message: "Recording ID required" });
      const recording = await Recording.findOne({
        _id: recordingId,
        userId: decoded.userId,
      });
      if (!recording)
        return sendJSON(res, 404, { message: "Recording not found" });
      const token = crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });
      let expiresAt = null;
      if (expiryDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);
      }
      const sharedLink = await SharedLink.create({
        recordingId,
        userId: decoded.userId,
        token,
        password: password || "",
        expiryDays: expiryDays || 0,
        expiresAt,
      });
      // const shareUrl = `http://localhost:${PORT}/share/${token}`;
      const shareUrl = `http://localhost:5000/share/${token}`;
      sendJSON(res, 201, {
        message: "Share link generated",
        shareUrl,
        password: password || null,
        expiresAt,
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (
    pathname.startsWith("/api/share/links/") &&
    pathname.endsWith("/block") &&
    method === "PUT"
  ) {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    const parts = pathname.split("/");
    const linkId = parts[4];
    try {
      const body = await parseBody(req);
      const link = await SharedLink.findOneAndUpdate(
        { _id: linkId, userId: decoded.userId },
        { status: body.status },
        { returnDocument: "after" },
      );
      if (!link) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, link);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/share/links/") && method === "DELETE") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    const linkId = pathname.split("/").pop();
    try {
      const link = await SharedLink.findOneAndDelete({
        _id: linkId,
        userId: decoded.userId,
      });
      if (!link) return sendJSON(res, 404, { message: "Not found" });
      sendJSON(res, 200, { message: "Deleted" });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/share/verify/") && method === "POST") {
    const token = pathname.split("/").pop();
    try {
      const { password, viewerName, viewerEmail } = await parseBody(req);
      const sharedLink = await SharedLink.findOne({ token });
      if (!sharedLink) return sendJSON(res, 404, { message: "Link not found" });
      if (sharedLink.status === "blocked")
        return sendJSON(res, 403, {
          message: "This share link has been blocked by the owner",
          blocked: true,
        });
      if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt)
        return sendJSON(res, 410, { message: "This share link has expired" });
      if (sharedLink.password && sharedLink.password !== password)
        return sendJSON(res, 403, { message: "Invalid password" });
      if (viewerName || viewerEmail) {
        sharedLink.views.push({
          name: viewerName || "Anonymous",
          email: viewerEmail || "unknown@email.com",
          viewedAt: new Date(),
        });
        await sharedLink.save();
      }
      sendJSON(res, 200, {
        recordingId: sharedLink.recordingId,
        message: "Access granted",
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/share/analytics/") && method === "GET") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    const token = pathname.split("/").pop();
    try {
      const sharedLink = await SharedLink.findOne({
        token,
        userId: decoded.userId,
      });
      if (!sharedLink) return sendJSON(res, 404, { message: "Not found" });
      const recording = await Recording.findById(sharedLink.recordingId);
      sendJSON(res, 200, {
        recordingTitle: recording ? recording.title : "Untitled",
        shareUrl: `http://localhost:${PORT}/share/${token}`,
        password: sharedLink.password || "None",
        expiry: sharedLink.expiresAt
          ? sharedLink.expiresAt.toISOString()
          : "Never",
        views: sharedLink.views,
        totalViews: sharedLink.views.length,
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  if (pathname.startsWith("/api/share/") && method === "GET") {
    const token = pathname.split("/").pop();
    if (
      !token ||
      token === "links" ||
      token === "generate" ||
      token === "verify" ||
      token === "analytics"
    )
      return;
    try {
      const sharedLink = await SharedLink.findOne({ token });
      if (!sharedLink)
        return sendJSON(res, 404, { message: "Link not found or expired" });
      if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt)
        return sendJSON(res, 410, { message: "This share link has expired" });
      const recording = await Recording.findById(sharedLink.recordingId);
      const user = await User.findById(sharedLink.userId).select("name email");
      sendJSON(res, 200, {
        hasPassword: !!sharedLink.password,
        sharedBy: user ? user.name : "Unknown",
        recordingTitle: recording ? recording.title : "Untitled",
        token: sharedLink.token,
        isBlocked: sharedLink.status === "blocked",
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  // Live viewer page (public - no auth)
  if (pathname.startsWith("/live/"))
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "live-view.html"),
    ); // ⬅️ ADD THIS
  // Share pages
  if (pathname.startsWith("/share/"))
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "share-access.html"),
    );
  if (pathname === "/share-view")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "share-view.html"),
    );
  if (pathname === "/share-analytics")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "share-analytics.html"),
    );

  // ═══════════════ ADMIN AUTH ROUTES ═══════════════
  if (pathname === "/api/admin/login" && method === "POST") {
    await handleAdminLogin(req, res);
    return;
  }
  if (pathname === "/api/admin/admins" && method === "GET") {
    await handleGetAdmins(req, res);
    return;
  }
  if (pathname === "/api/admin/create" && method === "POST") {
    await handleCreateAdmin(req, res);
    return;
  }
  if (pathname === "/api/admin/change-password" && method === "PUT") {
    await handleAdminChangePassword(req, res);
    return;
  }

  if (pathname === "/api/admin/update-profile" && method === "PUT") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.isAdmin)
      return sendJSON(res, 401, { message: "Unauthorized" });
    try {
      const { name, email } = await parseBody(req);
      if (!name || !email)
        return sendJSON(res, 400, { message: "Name and email required" });
      const existing = await Admin.findOne({
        email: email.toLowerCase(),
        _id: { $ne: decoded.adminId },
      });
      if (existing)
        return sendJSON(res, 400, { message: "Email already in use" });
      const admin = await Admin.findByIdAndUpdate(
        decoded.adminId,
        { name, email: email.toLowerCase() },
        { returnDocument: "after" },
      ).select("-password");
      if (!admin) return sendJSON(res, 404, { message: "Admin not found" });
      sendJSON(res, 200, { message: "Profile updated!", admin });
    } catch (err) {
      console.error("Update profile error:", err);
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  if (pathname.startsWith("/api/admin/admins/") && method === "DELETE") {
    const adminId = pathname.split("/").pop();
    await handleDeleteAdmin(req, res, adminId);
    return;
  }

  // Upload admin profile image
  if (pathname === "/api/admin/upload-image" && method === "POST") {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.isAdmin)
      return sendJSON(res, 401, { message: "Unauthorized" });
    try {
      const body = await parseBody(req);
      const { image } = body;
      if (!image) return sendJSON(res, 400, { message: "Image required" });
      const base64Size = (image.length * 3) / 4;
      if (base64Size > 2 * 1024 * 1024) {
        return sendJSON(res, 400, { message: "Image must be less than 2MB" });
      }
      const admin = await Admin.findByIdAndUpdate(
        decoded.adminId,
        { profile_image: image },
        { returnDocument: "after" },
      ).select("-password");
      if (!admin) return sendJSON(res, 404, { message: "Admin not found" });
      sendJSON(res, 200, {
        message: "Image uploaded!",
        profile_image: admin.profile_image,
      });
    } catch (err) {
      console.error("Upload image error:", err);
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Admin pages
  if (pathname === "/admin/login")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "admin-login.html"),
    );
  if (pathname === "/admin/profile")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "admin-profile.html"),
    );

  const adminProtectedPaths = [
    "/admin/dashboard",
    "/admin/users",
    "/admin/contacts",
    "/admin/feedback",
    "/admin/reviews",
    "/admin/profile",
  ];
  if (adminProtectedPaths.includes(pathname)) {
    const decoded = verifyToken(req);
    if (!decoded || !decoded.isAdmin) {
      res.writeHead(302, { Location: "/admin/login" });
      res.end();
      return;
    }
  }

  // TEMP: Setup first admin
  if (pathname === "/api/admin/setup" && method === "POST") {
    try {
      const { name, email, password } = await parseBody(req);
      await Admin.deleteOne({ email: email.toLowerCase() });
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      const admin = await Admin.create({
        name,
        email: email.toLowerCase(),
        password: hash,
      });
      console.log("✅ Admin created successfully!");
      sendJSON(res, 201, {
        message: "Admin created successfully! You can now login.",
        email: admin.email,
        password: password,
      });
    } catch (err) {
      console.error("Setup error:", err);
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }

  // ═══════════════ CONFIG ENDPOINT (Secure API Keys) ═══════════════
  if (pathname === "/api/config" && method === "GET") {
    // Only send non-sensitive config that frontend needs
    sendJSON(res, 200, {
      WEB3FORMS_KEY: process.env.WEB3FORMS_KEY || "",
      // API_BASE_URL: process.env.API_BASE_URL || `http://localhost:${PORT}`
      API_BASE_URL:
        process.env.API_BASE_URL ||
        `https://fallstreamio-production.up.railway.app`,
    });
    return;
  }

  // ═══════════════ LIVE SESSION ROUTES ═══════════════

  // Create/Schedule session
  if (pathname === "/api/live/create" && method === "POST") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    try {
      const {
        title,
        description,
        mode,
        password,
        scheduledAt,
        scheduledEndAt,
        accessCodeCount,
      } = await parseBody(req);
      const roomId = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substr(2);

      // Generate access codes for private mode
      let accessCodes = [];
      if (mode === "private" && accessCodeCount > 0) {
        for (let i = 0; i < accessCodeCount; i++) {
          accessCodes.push({
            code: "FS-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
            label: `Attendee ${i + 1}`,
          });
        }
      }

      const session = await LiveSession.create({
        roomId,
        hostId: decoded.userId,
        title,
        description: description || "",
        mode: mode || "public",
        password: password || "",
        accessCodes,
        status: scheduledAt ? "scheduled" : "live",
        scheduledAt: scheduledAt || null,
        scheduledEndAt: scheduledEndAt || null,
        isActive: !scheduledAt,
        startedAt: scheduledAt ? null : new Date(),
      });

      sendJSON(res, 201, {
        message: scheduledAt ? "Session scheduled!" : "Session created!",
        session: {
          roomId: session.roomId,
          title: session.title,
          mode: session.mode,
          status: session.status,
          scheduledAt: session.scheduledAt,
          accessCodes: session.accessCodes,
          shareUrl: `http://localhost:5000/live/${session.roomId}`,
        },
      });
    } catch (err) {
      console.error("Live create error:", err);
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }
  // Update session details
  if (pathname.startsWith("/api/live/update/") && method === "PUT") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    const roomId = pathname.split("/").pop();
    try {
      const body = await parseBody(req);
      const session = await LiveSession.findOne({
        roomId,
        hostId: decoded.userId,
      });
      if (!session) return sendJSON(res, 404, { message: "Session not found" });
      // Update only provided fields
      if (body.title !== undefined) session.title = body.title;
      if (body.description !== undefined)
        session.description = body.description;
      if (body.mode !== undefined) session.mode = body.mode;
      if (body.password !== undefined) session.password = body.password;
      if (body.scheduledAt !== undefined)
        session.scheduledAt = body.scheduledAt || null;
      if (body.scheduledEndAt !== undefined)
        session.scheduledEndAt = body.scheduledEndAt || null;
      await session.save();
      sendJSON(res, 200, { message: "Session updated", session });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  // Delete session permanently (DELETE)
  if (pathname.startsWith("/api/live/") && method === "DELETE") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });
    const roomId = pathname.split("/").pop();
    try {
      const session = await LiveSession.findOneAndDelete({
        roomId,
        hostId: decoded.userId,
      });
      if (!session) return sendJSON(res, 404, { message: "Session not found" });
      sendJSON(res, 200, { message: "Session deleted" });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }
  // Get all sessions for host
  if (pathname === "/api/live/sessions" && method === "GET") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    try {
      const sessions = await LiveSession.find({ hostId: decoded.userId })
        .sort("-createdAt")
        .select("-chatMessages");
      sendJSON(res, 200, sessions);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Start a scheduled session
  if (pathname.startsWith("/api/live/start/") && method === "PUT") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    const roomId = pathname.split("/").pop();

    try {
      const session = await LiveSession.findOne({
        roomId,
        hostId: decoded.userId,
      });
      if (!session) return sendJSON(res, 404, { message: "Session not found" });

      session.status = "live";
      session.isActive = true;
      session.startedAt = new Date();
      await session.save();

      sendJSON(res, 200, { message: "Session is now live!", session });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Get room info (public)
  if (pathname.startsWith("/api/live/join/") && method === "GET") {
    const roomId = pathname.split("/").pop();

    try {
      const session = await LiveSession.findOne({ roomId });
      if (!session) return sendJSON(res, 404, { message: "Session not found" });

      const host = await User.findById(session.hostId).select(
        "name email profile_image",
      );

      sendJSON(res, 200, {
        roomId: session.roomId,
        title: session.title,
        description: session.description,
        mode: session.mode,
        status: session.status,
        hasPassword: !!session.password,
        hostName: host?.name || "Unknown",
        hostImage: host?.profile_image || "",
        scheduledAt: session.scheduledAt,
        viewerCount: session.viewerCount,
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Join session
  if (pathname.startsWith("/api/live/join/") && method === "POST") {
    const roomId = pathname.split("/").pop();

    try {
      const { password, userName } = await parseBody(req);
      const session = await LiveSession.findOne({ roomId });

      if (!session) return sendJSON(res, 404, { message: "Session not found" });
      if (session.status === "ended")
        return sendJSON(res, 410, { message: "Session has ended" });
      if (session.status === "scheduled")
        return sendJSON(res, 425, {
          message: "Session hasn't started yet",
          scheduledAt: session.scheduledAt,
        });

      // Password protection (works for both public and private)
      if (session.password) {
        if (!password)
          return sendJSON(res, 403, { message: "Password required" });
        if (session.password !== password)
          return sendJSON(res, 403, { message: "Invalid password" });
      }

      // Increment viewer count
      session.viewerCount++;
      await session.save();

      const name = userName || "Anonymous";

      sendJSON(res, 200, {
        message: "Access granted",
        roomId: session.roomId,
        userName: name,
        wsUrl: `wss://fallstreamio-production.up.railway.app/ws/live?roomId=${roomId}&role=viewer&userId=${encodeURIComponent(name)}`,
      });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error: " + err.message });
    }
    return;
  }

  // Get chat messages
  if (pathname.startsWith("/api/live/chat/") && method === "GET") {
    const roomId = pathname.split("/").pop();

    try {
      const session = await LiveSession.findOne({ roomId }).select(
        "chatMessages",
      );
      if (!session) return sendJSON(res, 404, { message: "Not found" });

      sendJSON(res, 200, session.chatMessages.slice(-100)); // Last 100 messages
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Update access code label
  if (pathname.startsWith("/api/live/codes/") && method === "PUT") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    const roomId = pathname.split("/")[4];

    try {
      const { codeId, label } = await parseBody(req);
      const session = await LiveSession.findOne({
        roomId,
        hostId: decoded.userId,
      });
      if (!session) return sendJSON(res, 404, { message: "Not found" });

      const codeEntry = session.accessCodes.id(codeId);
      if (codeEntry) {
        codeEntry.label = label;
        await session.save();
      }

      sendJSON(res, 200, session.accessCodes);
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // End session
  if (pathname.startsWith("/api/live/end/") && method === "PUT") {
    const decoded = verifyToken(req);
    if (!decoded) return sendJSON(res, 401, { message: "Unauthorized" });

    const roomId = pathname.split("/").pop();

    try {
      const session = await LiveSession.findOne({
        roomId,
        hostId: decoded.userId,
      });
      if (!session) return sendJSON(res, 404, { message: "Session not found" });

      session.status = "ended";
      session.isActive = false;
      session.endedAt = new Date();
      await session.save();

      sendJSON(res, 200, { message: "Session ended", session });
    } catch (err) {
      sendJSON(res, 500, { message: "Server error" });
    }
    return;
  }

  // Static pages

  if (pathname === "/documents")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "document-viewer.html"),
    );

  if (pathname === "/live-session")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "live-session.html"),
    ); // ⬅️ ADD THIS
  if (pathname === "/live-screen")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "live-screen.html"),
    );
  if (pathname === "/verify-email")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "verify-email.html"),
    );

  if (pathname === "/login")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "login.html"),
    );
  if (pathname === "/signup")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "signup.html"),
    );
  if (pathname === "/dashboard")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "dashboard.html"),
    );
  if (pathname === "/profile")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "profile.html"),
    );
  if (pathname === "/recording")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "recording.html"),
    );
  if (pathname === "/downloads")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "downloads.html"),
    );
  if (pathname === "/forgot-password")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "forgot-password.html"),
    );
  if (pathname === "/feedback")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "tool", "feedback.html"),
    );
  if (pathname === "/admin/message-all")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "message-all.html"),
    );
  if (pathname === "/admin/reviews")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "reviews.html"),
    );
  if (pathname === "/admin/dashboard" || pathname === "/dashboard")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "dashboard.html"),
    );
  if (pathname === "/admin/users")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "users.html"),
    );
  if (pathname === "/admin/user-view")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "user-view.html"),
    );
  if (pathname === "/admin/edit-user")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "edit-user.html"),
    );
  if (pathname === "/admin/message-user")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "message-user.html"),
    );
  if (pathname === "/admin/feedback")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "feedback.html"),
    );
  if (pathname === "/admin/feedback-view")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "feedback-view.html"),
    );
  if (pathname === "/admin/contacts")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "contacts.html"),
    );
  if (pathname === "/admin/contact-view")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "contact-view.html"),
    );
  if (pathname === "/admin/contact-reply")
    return serveStaticFile(
      res,
      path.join(process.cwd(), "Views", "admin", "contact-reply.html"),
    );

  // Static files
  const filePath = path.join(process.cwd(), "Views", pathname);
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile())
    return serveStaticFile(res, filePath);

  res.writeHead(404);
  res.end("<h1>404 - Not Found</h1>");
});
// ========== WEBSOCKET SETUP ==========
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ noServer: true });

// Store active connections
const rooms = new Map(); // roomId -> { host: ws, viewers: Map<userId, ws>, offer: null }
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.split("?")[1]);
  const roomId = params.get("roomId");
  const role = params.get("role");
  const userId = params.get("userId") || "anonymous";

  if (!roomId || !role) {
    ws.close(4001, "Missing roomId or role");
    return;
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, { host: null, viewers: new Map(), pinnedMessage: null });
  }

  const room = rooms.get(roomId);

  if (role === "host") {
    room.host = ws;
    ws.roomId = roomId;
    ws.role = "host";
    console.log(`🟢 Host connected to room ${roomId}`);
    broadcastToRoom(
      roomId,
      { type: "viewer-count", count: room.viewers.size },
      "host",
    );
  } else {
    room.viewers.set(userId, ws);
    ws.roomId = roomId;
    ws.role = "viewer";
    ws.userId = userId;
    console.log(`👁️ Viewer ${userId} joined room ${roomId}`);

    // Notify host about the new viewer
    if (room.host && room.host.readyState === 1) {
      room.host.send(
        JSON.stringify({
          type: "viewer-joined",
          userId: userId,
          count: room.viewers.size,
        }),
      );
    }

    // Send viewer count to all viewers
    broadcastToRoom(roomId, { type: "viewer-count", count: room.viewers.size });
    // Send current pinned message (if any) to the new viewer
    if (room.pinnedMessage) {
      ws.send(
        JSON.stringify({
          type: "pin-message",
          message: room.pinnedMessage.message,
          userName: room.pinnedMessage.userName,
          pinned: true,
        }),
      );
    }
  }

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // ── Messages WITH a target → route to that user only ──
      if (msg.target) {
        const targetWs = room.viewers.get(msg.target);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify(msg));
        }
        return;
      }

      // ── Answers and ICE candidates from viewers go to host, tagged with userId ──
      if (msg.type === "answer" || msg.type === "ice-candidate") {
        if (room.host && room.host.readyState === 1) {
          room.host.send(JSON.stringify({ ...msg, userId: ws.userId }));
        }
        return;
      }

      // ── Broadcast messages (chat, session-ended, etc.) ──
      switch (msg.type) {
        case "pin-message":
          // Store the pinned message so new viewers can see it
          room.pinnedMessage = msg.pinned
            ? { message: msg.message, userName: msg.userName }
            : null;
          broadcastToRoom(roomId, {
            type: "pin-message",
            message: msg.message,
            userName: msg.userName,
            pinned: msg.pinned,
          });
          break;
        case "clear-pin":
          room.pinnedMessage = null;
          broadcastToRoom(roomId, { type: "clear-pin" });
          break;
        case "chat-message":
          try {
            await LiveSession.findOneAndUpdate(
              { roomId },
              {
                $push: {
                  chatMessages: {
                    userId: ws.userId,
                    userName: msg.userName || ws.userId,
                    message: msg.message,
                    timestamp: new Date(),
                  },
                },
              },
            );
          } catch (e) {
            console.error("Chat save error:", e);
          }

          broadcastToRoom(roomId, {
            type: "chat-message",
            userId: ws.userId,
            userName: msg.userName || ws.userId,
            message: msg.message,
            timestamp: new Date().toISOString(),
          });
          break;

        case "end-session":
          broadcastToRoom(roomId, { type: "session-ended" });
          rooms.delete(roomId);
          break;
      }
    } catch (e) {
      console.error("WebSocket message error:", e);
    }
  });

  ws.on("close", () => {
    if (ws.role === "host") {
      console.log(`🔴 Host left room ${roomId}`);
      broadcastToRoom(roomId, { type: "session-ended" });
      rooms.delete(roomId);
    } else {
      console.log(`👁️ Viewer ${ws.userId} left room ${roomId}`);
      room.viewers.delete(ws.userId);
      broadcastToRoom(roomId, {
        type: "viewer-count",
        count: room.viewers.size,
      });
      if (room.host && room.host.readyState === 1) {
        room.host.send(
          JSON.stringify({
            type: "viewer-left",
            userId: ws.userId,
            count: room.viewers.size,
          }),
        );
      }
    }
  });
});

function broadcastToRoom(roomId, message, targetRole = "all") {
  const room = rooms.get(roomId);
  if (!room) return;

  const msg = JSON.stringify(message);

  if (targetRole === "host" && room.host && room.host.readyState === 1) {
    room.host.send(msg);
  } else if (targetRole === "viewers") {
    room.viewers.forEach((viewerWs) => {
      if (viewerWs.readyState === 1) viewerWs.send(msg);
    });
  } else {
    if (room.host && room.host.readyState === 1) room.host.send(msg);
    room.viewers.forEach((viewerWs) => {
      if (viewerWs.readyState === 1) viewerWs.send(msg);
    });
  }
}

// Handle WebSocket upgrade
server.on("upgrade", (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  if (pathname === "/ws/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});
// ========== START ==========
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => {
      console.log(`🚀 Server: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });
