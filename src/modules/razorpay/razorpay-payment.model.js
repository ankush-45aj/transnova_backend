const mongoose = require("mongoose");

const razorpayPaymentSchema = new mongoose.Schema({
  // This is the same User document used by Circle, Crossmint and Transak transactions.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  firebaseUid: { type: String, required: true, index: true },
  razorpayOrderId: { type: String, required: true, unique: true, index: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true, index: true },
  receipt: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true, min: 1 }, // smallest INR unit (paise)
  currency: { type: String, required: true, default: "INR", enum: ["INR"] },
  status: { type: String, enum: ["created", "authorized", "captured", "failed"], default: "created", index: true },
  signatureVerified: { type: Boolean, default: false },
  processedWebhookEvents: { type: [String], default: [] },
  failureReason: { type: String },
  providerPayload: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

razorpayPaymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("RazorpayPayment", razorpayPaymentSchema);
