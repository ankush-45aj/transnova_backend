const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const environment = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  clientOrigin: process.env.CLIENT_ORIGIN,
  circleApiKey: process.env.CIRCLE_API_KEY,
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
  circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID,
  crossmintApiKey: process.env.CROSSMINT_API_KEY,
  crossmintBaseUrl: process.env.CROSSMINT_BASE_URL || "https://staging.crossmint.com",
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY,
};

module.exports = environment;
