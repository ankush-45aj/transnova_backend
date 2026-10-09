/**
 * DEV-ONLY ROUTES — /api/v1/dev
 * Helpers to sign up and sign in Firebase users via the Auth REST API
 * so you can get ID tokens for Postman testing without a frontend.
 *
 * ⚠️  Remove or gate these routes before going to production.
 */

const express = require("express");
const environment = require("../../config/environment");

const router = express.Router();

/**
 * POST /api/v1/dev/firebase-signup
 * Register a brand-new Firebase user and return their ID token.
 * Body: { email, password, displayName? }
 */
router.post("/firebase-signup", async (request, response, next) => {
  try {
    const { email, password, displayName } = request.body;

    if (!email || !password) {
      return response.status(400).json({ message: "email and password are required." });
    }
    if (password.length < 6) {
      return response.status(400).json({ message: "password must be at least 6 characters." });
    }

    const apiKey = environment.firebaseWebApiKey;
    if (!apiKey) {
      return response.status(500).json({ message: "FIREBASE_WEB_API_KEY is not configured on the server." });
    }

    // 1. Create the user account
    const signupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const signupData = await signupRes.json();

    if (!signupRes.ok) {
      return response.status(400).json({
        message: signupData.error?.message || "Firebase sign-up failed.",
        details: signupData.error,
      });
    }

    // 2. Optionally update display name
    if (displayName && signupData.idToken) {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: signupData.idToken, displayName, returnSecureToken: false }),
        }
      );
    }

    return response.status(201).json({
      message: "User created successfully. Use idToken as your Bearer token.",
      idToken: signupData.idToken,       // ← use as Bearer token in Postman
      refreshToken: signupData.refreshToken,
      expiresIn: signupData.expiresIn,
      email: signupData.email,
      uid: signupData.localId,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/dev/firebase-token
 * Sign in an existing Firebase user and return their ID token.
 * Body: { email, password }
 */
router.post("/firebase-token", async (request, response, next) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return response.status(400).json({ message: "email and password are required." });
    }

    const apiKey = environment.firebaseWebApiKey;
    if (!apiKey) {
      return response.status(500).json({ message: "FIREBASE_WEB_API_KEY is not configured on the server." });
    }

    const firebaseRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await firebaseRes.json();

    if (!firebaseRes.ok) {
      return response.status(401).json({
        message: data.error?.message || "Firebase sign-in failed.",
        details: data.error,
      });
    }

    return response.status(200).json({
      idToken: data.idToken,          // ← use as Bearer token in Postman
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      email: data.email,
      uid: data.localId,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

