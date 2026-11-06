const environment = require("../../config/environment");

const assertRazorpayConfiguration = () => {
  if (!environment.razorpayKeyId || !environment.razorpayKeySecret) {
    const error = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    error.statusCode = 503;
    throw error;
  }

  if (environment.razorpayMode !== "test") {
    const error = new Error("Only Razorpay test mode is enabled by this application.");
    error.statusCode = 503;
    throw error;
  }
};

module.exports = { assertRazorpayConfiguration };
