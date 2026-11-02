const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const remittanceService = require("./remittance.service");

const router = express.Router();

const initiateRemittanceSchema = z.object({
  walletId: z.string().trim().min(1, "walletId is required"),
  senderCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).default("INR"),
  senderAmount: z.coerce.number().positive("Amount must be greater than zero"),
  recipientCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).default("USD"),
  recipientPaymentMethodId: z.string().trim().min(1, "recipientPaymentMethodId is required"),
});

/**
 * POST /api/v1/remittance/initiate
 * Starts an end-to-end remittance (On-ramp -> Transfer -> Off-ramp).
 */
router.post("/initiate", requireAuth, async (request, response, next) => {
  try {
    const input = initiateRemittanceSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const result = await remittanceService.initiateRemittance({
      userId: user._id,
      walletId: input.walletId,
      senderCurrency: input.senderCurrency,
      senderAmount: input.senderAmount,
      recipientCurrency: input.recipientCurrency,
      recipientPaymentMethodId: input.recipientPaymentMethodId,
      userIp: request.ip,
    });

    return response.status(201).json({
      message: "Remittance initiated successfully.",
      remittance: result.remittance,
      widgetUrl: result.widgetUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

/**
 * GET /api/v1/remittance/:remittanceId
 * Get detailed live status and pipeline timeline of a remittance.
 */
router.get("/:remittanceId", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const remittance = await remittanceService.getRemittanceStatus(request.params.remittanceId, user._id);
    return response.status(200).json({ remittance });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/remittance
 * List all remittances for the authenticated user.
 */
router.get("/", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(200).json({ remittances: [] });

    const remittances = await remittanceService.listUserRemittances(user._id);
    return response.status(200).json({ remittances });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

