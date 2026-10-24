const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const Transaction = require("./transaction.model");
const transactionService = require("./transaction.service");

const router = express.Router();

const createSchema = z.object({
  type: z.enum(["payin", "wallet_transfer", "offramp"]),
  amount: z.coerce.number().positive().max(1000000),
  asset: z.string().trim().toUpperCase().default("USDC"),
  destinationWalletAddress: z.string().trim().optional(),
});

const estimateFeeSchema = z.object({
  walletId: z.string().trim().min(1, "walletId is required"),
  destinationAddress: z.string().trim().min(1, "destinationAddress is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
});

const circleTransferSchema = z.object({
  walletId: z.string().trim().min(1, "walletId is required"),
  destinationAddress: z.string().trim().min(1, "destinationAddress is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
});

/**
 * POST /api/v1/transactions/estimate-fee
 * Estimate transfer fee before executing Circle USDC transfer.
 */
router.post("/estimate-fee", requireAuth, async (request, response, next) => {
  try {
    const input = estimateFeeSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const feeInfo = await transactionService.estimateFee({
      walletId: input.walletId,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
      userId: user._id,
    });

    return response.status(200).json(feeInfo);
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

/**
 * POST /api/v1/transactions/circle-transfer
 * Execute Circle USDC transfer.
 */
router.post("/circle-transfer", requireAuth, async (request, response, next) => {
  try {
    const input = circleTransferSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const transaction = await transactionService.executeCircleTransfer({
      walletId: input.walletId,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
      userId: user._id,
    });

    return response.status(201).json({
      message: "Circle USDC transfer initiated.",
      transaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

/**
 * GET /api/v1/transactions/circle/:circleTransactionId
 * Fetch transaction status directly from Circle SDK and sync local state.
 */
router.get("/circle/:circleTransactionId", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const statusData = await transactionService.getCircleTransactionStatus(
      request.params.circleTransactionId,
      user._id
    );

    return response.status(200).json(statusData);
  } catch (error) {
    return next(error);
  }
});

/**
 * Existing route: POST /api/v1/transactions/simulate
 */
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

/**
 * Existing route: GET /api/v1/transactions
 */
router.get("/", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(200).json({ transactions: [] });
    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });
    return response.status(200).json({ transactions });
  } catch (error) { return next(error); }
});

module.exports = router;
