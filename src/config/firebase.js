const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const environment = require("./environment");

const initializeFirebase = () => {
  if (getApps().length) return getApps()[0];

  if (!environment.firebaseServiceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required to verify Firebase ID tokens.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(environment.firebaseServiceAccountJson);
  } catch (_error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
  }

  if (serviceAccount && serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return initializeApp({ credential: cert(serviceAccount) });
};

const admin = {
  auth: () => {
    initializeFirebase();
    return getAuth();
  },
};

module.exports = { admin, initializeFirebase, getAuth };
