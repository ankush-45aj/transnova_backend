const crypto = require("crypto");
const environment = require("../../config/environment");
const { getRazorpayClient } = require("./razorpay.client");

const createOrder = ({ amountPaise, receipt, notes }) => getRazorpayClient().orders.create({
  amount: amountPaise,
  currency: "INR",
  receipt,
  notes,
});

const fetchPayment = (paymentId) => getRazorpayClient().payments.fetch(paymentId);

const safeEqual = (actual, expected) => {
  const actualBuffer = Buffer.from(actual || "");
  const expectedBuffer = Buffer.from(expected || "");
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  const expected = crypto.createHmac("sha256", environment.razorpayKeySecret || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(signature, expected);
};

const verifyWebhookSignature = ({ rawBody, signature }) => {
  const expected = crypto.createHmac("sha256", environment.razorpayWebhookSecret || "")
    .update(rawBody)
    .digest("hex");
  return safeEqual(signature, expected);
};

module.exports = { createOrder, fetchPayment, verifyPaymentSignature, verifyWebhookSignature };
