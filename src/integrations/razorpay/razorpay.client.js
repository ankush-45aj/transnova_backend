const environment = require("../../config/environment");
const { assertRazorpayConfiguration } = require("./razorpay.config");

const getRazorpayClient = () => {
  assertRazorpayConfiguration();
  let Razorpay;
  try {
    // Kept lazy so an absent optional runtime dependency does not stop unrelated
    // international-payment routes from starting.
    Razorpay = require("razorpay");
  } catch (cause) {
    const error = new Error("Razorpay SDK is not installed. Run npm install.");
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
  return new Razorpay({
    key_id: environment.razorpayKeyId,
    key_secret: environment.razorpayKeySecret,
  });
};

module.exports = { getRazorpayClient };
