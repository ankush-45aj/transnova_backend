const crypto = require("crypto");
const RazorpayPayment = require("./razorpay-payment.model");
const razorpay = require("../../integrations/razorpay/razorpay.service");

const toPaise = (amount) => Math.round(Number(amount) * 100);
const statusForPayment = (payment) => {
  if (payment.status === "captured") return "captured";
  if (payment.status === "failed") return "failed";
  return "authorized";
};

class RazorpayPaymentService {
  async createOrder({ user, amount }) {
    const amountPaise = toPaise(amount);
    const receipt = `tn_rzp_${crypto.randomUUID().replaceAll("-", "")}`;
    const order = await razorpay.createOrder({
      amountPaise,
      receipt,
      notes: { userId: String(user._id), firebaseUid: user.firebaseUid },
    });
    return RazorpayPayment.create({
      user: user._id,
      firebaseUid: user.firebaseUid,
      razorpayOrderId: order.id,
      receipt,
      amount: order.amount,
      currency: order.currency,
      status: "created",
      providerPayload: { order },
    });
  }

  async verifyPayment({ userId, orderId, paymentId, signature }) {
    const payment = await RazorpayPayment.findOne({ razorpayOrderId: orderId, user: userId });
    if (!payment) {
      const error = new Error("Razorpay order was not found for this user.");
      error.statusCode = 404;
      throw error;
    }
    if (payment.signatureVerified && payment.razorpayPaymentId === paymentId) return payment;
    if (!razorpay.verifyPaymentSignature({ orderId, paymentId, signature })) {
      const error = new Error("Invalid Razorpay payment signature.");
      error.statusCode = 400;
      throw error;
    }

    const providerPayment = await razorpay.fetchPayment(paymentId);
    if (providerPayment.order_id !== orderId || providerPayment.amount !== payment.amount || providerPayment.currency !== "INR") {
      const error = new Error("Razorpay payment does not match the saved order.");
      error.statusCode = 400;
      throw error;
    }
    payment.razorpayPaymentId = paymentId;
    payment.signatureVerified = true;
    payment.status = statusForPayment(providerPayment);
    payment.failureReason = providerPayment.error_description || undefined;
    payment.providerPayload = { ...payment.providerPayload, payment: providerPayment };
    await payment.save();
    return payment;
  }

  async processWebhook({ event, eventId, payload }) {
    const orderId = payload?.payload?.order?.entity?.id || payload?.payload?.payment?.entity?.order_id;
    if (!orderId) return { received: true, ignored: true };
    const update = { $addToSet: { processedWebhookEvents: eventId } };
    const existing = await RazorpayPayment.findOneAndUpdate(
      { razorpayOrderId: orderId, processedWebhookEvents: { $ne: eventId } }, update, { new: true }
    );
    if (!existing) return { received: true, duplicate: true };

    const providerPayment = payload?.payload?.payment?.entity;
    if (providerPayment) {
      existing.razorpayPaymentId = providerPayment.id || existing.razorpayPaymentId;
      existing.failureReason = providerPayment.error_description || undefined;
    }
    if (event === "payment.captured" || event === "order.paid") existing.status = "captured";
    if (event === "payment.failed") existing.status = "failed";
    existing.providerPayload = { ...existing.providerPayload, webhook: payload };
    await existing.save();
    return { received: true };
  }
}

module.exports = new RazorpayPaymentService();
