const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, trim: true, default: "" },
    phoneNumber: { type: String, trim: true },
    kycStatus: { type: String, enum: ["not_started", "pending", "verified", "rejected"], default: "not_started" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
