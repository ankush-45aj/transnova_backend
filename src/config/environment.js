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
  transakApiKey: process.env.TRANSAK_API_KEY,
  transakApiSecret: process.env.TRANSAK_API_SECRET,
  transakBaseUrl: process.env.TRANSAK_BASE_URL || "https://api-stg.transak.com",
  transakGatewayBaseUrl: process.env.TRANSAK_GATEWAY_BASE_URL || "https://api-gateway-stg.transak.com",
  transakReferrerDomain: process.env.TRANSAK_REFERRER_DOMAIN,
  transakNetwork: process.env.TRANSAK_NETWORK,
  transakCircleBlockchain: process.env.TRANSAK_CIRCLE_BLOCKCHAIN,
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY,
};

module.exports = environment;
