const environment = require("../../config/environment");

const assertRazorpayConfiguration = () => {
  if (!environment.razorpayKeyId || !environment.razorpayKeySecret) {
    const error = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    error.statusCode = 503;
    throw error;
  }

  if (!["test", "live"].includes(environment.razorpayMode)) {
    const error = new Error("RAZORPAY_MODE must be either test or live.");
    error.statusCode = 503;
    throw error;
  }
  if (environment.paymentMode === "sandbox" && environment.razorpayMode !== "test") {
    const error = new Error("Phase 1 supports Razorpay test mode only.");
    error.statusCode = 503;
    throw error;
  }
  if (process.env.NODE_ENV === "production" && environment.razorpayMode !== "live") {
    const error = new Error("Razorpay production use requires RAZORPAY_MODE=live.");
    error.statusCode = 503;
    throw error;
  }
};

module.exports = { assertRazorpayConfiguration };
