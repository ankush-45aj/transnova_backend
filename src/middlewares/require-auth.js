const { admin, initializeFirebase } = require("../config/firebase");

const requireAuth = async (request, _response, next) => {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    const error = new Error("A Firebase ID token is required.");
    error.statusCode = 401;
    return next(error);
  }

  try {
    initializeFirebase();
    request.auth = await admin.auth().verifyIdToken(header.slice(7));
    return next();
  } catch (error) {
    console.error("Auth verification failed:", error.message || error);
    const authError = new Error("Invalid or expired Firebase ID token.");
    authError.statusCode = 401;
    return next(authError);
  }
};

module.exports = requireAuth;
