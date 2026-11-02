const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paymentMethodId: { type: String, required: true, unique: true, index: true },
    type: { type: String, default: "ach" },
    status: { type: String, default: "active" },
    beneficiaryName: { type: String },
    bankName: { type: String },
    accountLast4: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);

