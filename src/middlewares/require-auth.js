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
  } catch (_error) {
    const error = new Error("Invalid or expired Firebase ID token.");
    error.statusCode = 401;
    return next(error);
  }
};

module.exports = requireAuth;
