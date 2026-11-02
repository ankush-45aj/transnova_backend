const mongoose = require("mongoose");

const remittanceSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    senderCurrency: { type: String, required: true, uppercase: true, default: "INR" },
    senderAmount: { type: mongoose.Schema.Types.Decimal128, required: true },
    usdcAmount: { type: mongoose.Schema.Types.Decimal128 },
    recipientCurrency: { type: String, required: true, uppercase: true, default: "USD" },
    recipientAmount: { type: mongoose.Schema.Types.Decimal128 },
    recipientPaymentMethodId: { type: String, required: true },
    recipientInfo: {
      name: { type: String },
      email: { type: String },
      bankName: { type: String },
      accountLast4: { type: String },
    },
    status: {
      type: String,
      enum: [
        "created",
        "onramp_pending",
        "onramp_completed",
        "transfer_pending",
        "transfer_completed",
        "offramp_pending",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "created",
      index: true,
    },
    onrampTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    transferTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    offrampTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    error: { type: mongoose.Schema.Types.Mixed },
    timeline: [
      {
        stage: { type: String },
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        details: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Remittance", remittanceSchema);

