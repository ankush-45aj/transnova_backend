const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const environment = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  clientOrigin: process.env.CLIENT_ORIGIN,
  trustProxy: process.env.TRUST_PROXY
    ? (Number.isInteger(Number(process.env.TRUST_PROXY))
      ? Number(process.env.TRUST_PROXY)
      : process.env.TRUST_PROXY.split(",").map((value) => value.trim()))
    : undefined,
  circleApiKey: process.env.CIRCLE_API_KEY,
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
  circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID,
  crossmintApiKey: process.env.CROSSMINT_API_KEY,
  crossmintBaseUrl: process.env.CROSSMINT_BASE_URL || "https://staging.crossmint.com",
  crossmintWebhookSecret: process.env.CROSSMINT_WEBHOOK_SECRET,
  transakApiKey: process.env.TRANSAK_API_KEY || (process.env.NODE_ENV !== "production" ? "sandbox_transak_key" : undefined),
  transakApiSecret: process.env.TRANSAK_API_SECRET || (process.env.NODE_ENV !== "production" ? "sandbox_transak_secret" : undefined),
  transakBaseUrl: process.env.TRANSAK_BASE_URL || "https://api-stg.transak.com",
  transakGatewayBaseUrl: process.env.TRANSAK_GATEWAY_BASE_URL || "https://api-gateway-stg.transak.com",
  transakReferrerDomain: process.env.TRANSAK_REFERRER_DOMAIN || "localhost:3000",
  transakNetwork: process.env.TRANSAK_NETWORK || "polygon",
  transakCircleBlockchain: process.env.TRANSAK_CIRCLE_BLOCKCHAIN || "MATIC-AMOY",
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  razorpayMode: process.env.RAZORPAY_MODE || "test",
  // Phase 1 is deliberately sandbox-only. A future production release must
  // explicitly replace this guard after compliance and settlement work lands.
  paymentMode: process.env.PAYMENT_MODE || "sandbox",
  sandboxBlockchain: process.env.SANDBOX_BLOCKCHAIN || "MATIC-AMOY",
  requireIdempotencyKeys: process.env.REQUIRE_IDEMPOTENCY_KEYS !== "false" && process.env.NODE_ENV !== "test",
  requireKycForMoneyMovement: process.env.REQUIRE_KYC_FOR_MONEY_MOVEMENT === "true" || process.env.NODE_ENV === "production",
};

module.exports = environment;
