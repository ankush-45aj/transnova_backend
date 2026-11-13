const app = require("./app");
const connectDatabase = require("./config/database");
const environment = require("./config/environment");

const assertPhaseOneSandboxConfiguration = () => {
  if (environment.paymentMode !== "sandbox") {
    throw new Error("This Phase 1 build supports PAYMENT_MODE=sandbox only.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("This Phase 1 build cannot run in production mode or process real money.");
  }
  if (environment.razorpayMode !== "test") {
    throw new Error("Phase 1 requires Razorpay test mode.");
  }
  if (String(environment.sandboxBlockchain).toUpperCase() !== "MATIC-AMOY") {
    throw new Error("Phase 1 requires SANDBOX_BLOCKCHAIN=MATIC-AMOY.");
  }
};

const assertProductionConfiguration = () => {
  if (process.env.NODE_ENV !== "production") return;
  const required = ["mongoUri", "firebaseServiceAccountJson", "circleApiKey", "circleEntitySecret", "circleWalletSetId", "crossmintApiKey", "crossmintWebhookSecret", "transakApiKey", "transakApiSecret", "transakReferrerDomain", "transakNetwork", "transakCircleBlockchain", "razorpayKeyId", "razorpayKeySecret", "razorpayWebhookSecret"];
  const missing = required.filter((key) => !environment[key]);
  if (missing.length) throw new Error(`Production configuration missing: ${missing.join(", ")}`);
  if (/staging|stg/i.test(environment.crossmintBaseUrl) || /staging|stg/i.test(environment.transakBaseUrl) || /amoy/i.test(environment.transakCircleBlockchain)) {
    throw new Error("Production configuration must use live provider URLs and a non-test blockchain.");
  }
  if (environment.razorpayMode !== "live") throw new Error("Production configuration requires RAZORPAY_MODE=live.");
};

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

const startServer = async () => {
  assertPhaseOneSandboxConfiguration();
  assertProductionConfiguration();
  await connectDatabase();

  app.listen(environment.port, () => {
    console.log(`TransNova server running on port ${environment.port}`);
  });
};

startServer();
