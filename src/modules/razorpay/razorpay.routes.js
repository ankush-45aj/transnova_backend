const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const environment = require("../../config/environment");
const User = require("../users/user.model");
const RazorpayPayment = require("./razorpay-payment.model");
const paymentService = require("./razorpay.service");
const razorpay = require("../../integrations/razorpay/razorpay.service");

const router = express.Router();
const amountSchema = z.object({
  amount: z.coerce.number().positive().max(1000000)
    .refine((value) => Number.isInteger(value * 100), "Amount can have at most two decimal places"),
});
const verifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1),
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/i),
});
const getUser = async (uid) => User.findOne({ firebaseUid: uid });

router.post("/create-order", requireAuth, async (request, response, next) => {
  try {
    const input = amountSchema.parse(request.body);
    const user = await getUser(request.auth.uid);
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    const payment = await paymentService.createOrder({ user, amount: input.amount });
    return response.status(201).json({
      keyId: environment.razorpayKeyId,
      orderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      payment,
    });
  } catch (error) { if (error instanceof z.ZodError) error.statusCode = 400; return next(error); }
});

router.post("/verify-payment", requireAuth, async (request, response, next) => {
  try {
    const input = verifySchema.parse(request.body);
    const user = await getUser(request.auth.uid);
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    const payment = await paymentService.verifyPayment({ userId: user._id, orderId: input.razorpay_order_id, paymentId: input.razorpay_payment_id, signature: input.razorpay_signature });
    return response.status(200).json({ payment });
  } catch (error) { if (error instanceof z.ZodError) error.statusCode = 400; return next(error); }
});

router.post("/webhook", async (request, response, next) => {
  try {
    const rawBody = request.body;
    if (!Buffer.isBuffer(rawBody) || !environment.razorpayWebhookSecret || !razorpay.verifyWebhookSignature({ rawBody, signature: request.get("x-razorpay-signature") })) {
      return response.status(400).json({ message: "Invalid Razorpay webhook signature." });
    }
    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventId = request.get("x-razorpay-event-id") || `${payload.event}:${payload.created_at}:${payload.payload?.payment?.entity?.id || payload.payload?.order?.entity?.id}`;
    if (!["payment.captured", "payment.failed", "order.paid"].includes(payload.event)) return response.status(200).json({ received: true, ignored: true });
    return response.status(200).json(await paymentService.processWebhook({ event: payload.event, eventId, payload }));
  } catch (error) { return next(error); }
});

const getPayment = async (request, response, next) => {
  try {
    const user = await getUser(request.auth.uid);
    if (!user) return response.status(404).json({ message: "User profile not found." });
    const orderId = request.params.orderId || request.query.orderId;
    if (!orderId) return response.status(400).json({ message: "orderId is required." });
    const payment = await RazorpayPayment.findOne({ razorpayOrderId: orderId, user: user._id });
    if (!payment) return response.status(404).json({ message: "Payment not found." });
    return response.status(200).json({ payment });
  } catch (error) { return next(error); }
};

router.get("/payment", requireAuth, getPayment);
router.get("/payment/:orderId", requireAuth, getPayment);

router.get("/history", requireAuth, async (request, response, next) => {
  try {
    const user = await getUser(request.auth.uid);
    if (!user) return response.status(200).json({ payments: [] });
    const payments = await RazorpayPayment.find({ user: user._id }).sort({ createdAt: -1 });
    return response.status(200).json({ payments });
  } catch (error) { return next(error); }
});

module.exports = router;
