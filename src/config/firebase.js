const admin = require("firebase-admin");
const environment = require("./environment");

const initializeFirebase = () => {
  if (admin.apps.length) return admin.app();

  if (!environment.firebaseServiceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required to verify Firebase ID tokens.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(environment.firebaseServiceAccountJson);
  } catch (_error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
  }

  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
};

module.exports = { admin, initializeFirebase };
