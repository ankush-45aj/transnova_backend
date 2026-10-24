const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, required: true, default: "placeholder" },
    providerWalletId: { type: String, sparse: true, index: true },
    asset: { type: String, required: true, uppercase: true, default: "USDC" },
    network: { type: String, required: true, default: "placeholder" },
    address: { type: String, sparse: true, lowercase: true },
    circleWalletId: { type: String, sparse: true, index: true },
    circleAddress: { type: String, sparse: true },
    crossmintPublicKey: { type: String, sparse: true },
    blockchain: { type: String },
    accountType: { type: String },
    availableBalance: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    status: { type: String, enum: ["active", "frozen", "closed"], default: "active" },
  },
  { timestamps: true }
);

walletSchema.index({ user: 1, asset: 1, network: 1 }, { unique: true });
module.exports = mongoose.model("Wallet", walletSchema);
