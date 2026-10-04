const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const Transaction = require("./transaction.model");

const router = express.Router();
const createSchema = z.object({
  type: z.enum(["payin", "wallet_transfer", "offramp"]),
  amount: z.coerce.number().positive().max(1000000),
  asset: z.string().trim().toUpperCase().default("USDC"),
  destinationWalletAddress: z.string().trim().optional(),
});

router.post("/simulate", requireAuth, async (request, response, next) => {
  try {
    const input = createSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    const transaction = await Transaction.create({
      reference: `tn_demo_${crypto.randomUUID()}`,
      user: user._id,
      type: input.type,
      amount: input.amount.toString(),
      asset: input.asset,
      status: "completed",
      metadata: { simulation: true, destinationWalletAddress: input.destinationWalletAddress },
    });
    return response.status(201).json({ transaction, message: "Simulated transaction only. No money or stablecoin was transferred." });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

router.get("/", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(200).json({ transactions: [] });
    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });
    return response.status(200).json({ transactions });
  } catch (error) { return next(error); }
});

module.exports = router;
