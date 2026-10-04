require("dotenv").config();

const environment = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  clientOrigin: process.env.CLIENT_ORIGIN,
};

module.exports = environment;
