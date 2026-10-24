const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const walletService = require("./wallet.service");

const router = express.Router();

const createWalletSchema = z.object({
  blockchain: z.string().trim().default("MATIC-AMOY"),
  accountType: z.string().trim().default("SCA"),
});

const validateAddressSchema = z.object({
  address: z.string().trim().min(1, "Address is required"),
  blockchain: z.string().trim().default("MATIC-AMOY"),
});

/**
 * POST /api/v1/wallets/circle
 * Create or provision a Circle developer-controlled wallet for authenticated user.
 */
router.post("/circle", requireAuth, async (request, response, next) => {
  try {
    const input = createWalletSchema.parse(request.body || {});
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) {
      return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    }

    const wallet = await walletService.createCircleWallet(user._id, {
      blockchains: [input.blockchain],
      accountType: input.accountType,
    });

    return response.status(201).json({
      message: "Circle wallet created successfully.",
      wallet,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

/**
 * GET /api/v1/wallets/:walletId/balance
 * Get wallet token balance from Circle SDK.
 */
router.get("/:walletId/balance", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) {
      return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    }

    const balanceData = await walletService.getWalletBalance(request.params.walletId, user._id);
    return response.status(200).json(balanceData);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/wallets/validate-address
 * Validate destination blockchain address via Circle SDK.
 */
router.post("/validate-address", requireAuth, async (request, response, next) => {
  try {
    const input = validateAddressSchema.parse(request.body);
    const result = await walletService.validateAddress(input.address, input.blockchain);
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

module.exports = router;
