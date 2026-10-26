const express = require("express");
const { z } = require("zod");
const environment = require("../../config/environment");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const onrampService = require("./onramp.service");

const router = express.Router();

const createWidgetSchema = z.object({
  walletId: z.string().trim().min(1, "walletId is required"),
  fiatCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, "fiatCurrency must be a 3-letter code")
    .transform((value) => value.toUpperCase()).default("USD"),
  fiatAmount: z.coerce.number().positive().max(1000000),
});

const requireConfiguredOrigin = (request, _response, next) => {
  if (!environment.clientOrigin) {
    const error = new Error("CLIENT_ORIGIN must be configured for Transak on-ramp.");
    error.statusCode = 503;
    return next(error);
  }

  let expectedOrigin;
  try {
    expectedOrigin = new URL(environment.clientOrigin).origin;
  } catch (_error) {
    const error = new Error("CLIENT_ORIGIN is not a valid URL.");
    error.statusCode = 500;
    return next(error);
  }

  if (!request.get("origin") || request.get("origin") !== expectedOrigin) {
    const error = new Error("Request origin is not allowed to start a Transak session.");
    error.statusCode = 403;
    return next(error);
  }

  return next();
};

router.post("/widget-url", requireAuth, requireConfiguredOrigin, async (request, response, next) => {
  try {
    const input = createWidgetSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) {
      return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    }

    const result = await onrampService.createWidgetOrder({
      userId: user._id,
      walletId: input.walletId,
      fiatCurrency: input.fiatCurrency,
      fiatAmount: input.fiatAmount,
      userIp: request.ip,
    });

    return response.status(201).json({
      transaction: result.transaction,
      widgetUrl: result.widgetUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

router.get("/transactions/:transactionId", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) {
      return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    }

    const transaction = await onrampService.getUserTransaction(request.params.transactionId, user._id);
    if (!transaction) {
      return response.status(404).json({ message: "On-ramp transaction not found." });
    }

    return response.status(200).json({ transaction });
  } catch (error) {
    return next(error);
  }
});

router.post("/webhooks/transak", async (request, response, next) => {
  try {
    const result = await onrampService.processWebhook(request.body);
    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
