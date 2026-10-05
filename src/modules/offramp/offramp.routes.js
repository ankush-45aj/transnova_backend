const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const offrampService = require("./offramp.service");

const router = express.Router();

const addressSchema = z.object({
  street1: z.string().trim().min(1, "street1 is required"),
  street2: z.string().trim().optional(),
  city: z.string().trim().min(1, "city is required"),
  state: z.string().trim().min(1, "state is required"),
  postalCode: z.string().trim().min(1, "postalCode is required"),
  country: z.string().trim().length(2, "country must be a 2-letter ISO code").default("US"),
});

const beneficiarySchema = z.object({
  name: z.string().trim().min(1, "Beneficiary name is required"),
  email: z.string().trim().email("Valid email is required"),
  address: addressSchema,
});

const bankAccountSchema = z.object({
  accountType: z.enum(["checking", "savings"]).default("checking"),
  routingNumber: z.string().trim().min(9, "Routing number must be at least 9 digits"),
  accountNumber: z.string().trim().min(4, "Account number must be at least 4 digits"),
  bankName: z.string().trim().optional(),
});

const createPaymentMethodSchema = z.object({
  type: z.string().trim().default("ach"),
  beneficiary: beneficiarySchema,
  bankAccount: bankAccountSchema,
});

const createOrderSchema = z.object({
  payerAddress: z.string().trim().min(1, "payerAddress is required"),
  paymentMethodId: z.string().trim().min(1, "paymentMethodId is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  chain: z.string().trim().default("polygon-amoy"),
  currency: z.string().trim().default("usdc"),
});

/**
 * POST /api/v1/offramp/payment-methods
 * Create Crossmint off-ramp payment method (ACH bank account).
 */
router.post("/payment-methods", requireAuth, async (request, response, next) => {
  try {
    const input = createPaymentMethodSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const result = await offrampService.createPaymentMethod({
      type: input.type,
      beneficiary: input.beneficiary,
      bankAccount: input.bankAccount,
      user,
    });

    return response.status(201).json({
      message: "Payment method created successfully.",
      paymentMethodId: result.paymentMethodId,
      type: result.type,
      status: result.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

/**
 * POST /api/v1/offramp/orders
 * Create Crossmint off-ramp order.
 */
router.post("/orders", requireAuth, async (request, response, next) => {
  try {
    const input = createOrderSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const orderResult = await offrampService.createOfframpOrder({
      payerAddress: input.payerAddress,
      paymentMethodId: input.paymentMethodId,
      amount: input.amount,
      user,
      chain: input.chain,
      currency: input.currency,
    });

    return response.status(201).json({
      message: "Off-ramp order created successfully.",
      orderId: orderResult.orderId,
      status: orderResult.status,
      requiresKyc: orderResult.requiresKyc,
      transaction: orderResult.transaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

module.exports = router;
