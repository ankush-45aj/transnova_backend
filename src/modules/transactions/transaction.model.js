const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["payin", "wallet_transfer", "offramp"], required: true },
    asset: { type: String, required: true, uppercase: true, default: "USDC" },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ["created", "pending", "processing", "completed", "failed", "cancelled"], default: "created" },
    sourceWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
    destinationWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
    provider: { type: String, default: "placeholder" },
    providerTransactionId: { type: String, sparse: true, index: true },
    sourceCurrency: { type: String, uppercase: true },
    sourceAmount: { type: mongoose.Schema.Types.Decimal128 },
    usdcAmount: { type: mongoose.Schema.Types.Decimal128 },
    destinationCurrency: { type: String, uppercase: true },
    destinationAmount: { type: mongoose.Schema.Types.Decimal128 },
    circleWalletId: { type: String },
    circleTransactionId: { type: String, sparse: true, index: true },
    circleTxHash: { type: String },
    circleStatus: { type: String },
    crossmintPaymentMethodId: { type: String },
    crossmintOrderId: { type: String, sparse: true, index: true },
    crossmintStatus: { type: String },
    transakOrderId: { type: String, sparse: true, index: true },
    transakStatus: { type: String },
    error: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
