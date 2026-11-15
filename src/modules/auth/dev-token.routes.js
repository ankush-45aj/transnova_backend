/**
 * DEV-ONLY ROUTES — /api/v1/dev
 * Helpers to sign up and sign in Firebase users via the Auth REST API
 * so you can get ID tokens for Postman testing without a frontend.
 *
 * ⚠️  Remove or gate these routes before going to production.
 */

const express = require("express");
const { z } = require("zod");
const environment = require("../../config/environment");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const Wallet = require("../wallets/wallet.model");
const Transaction = require("../transactions/transaction.model");
const crypto = require("crypto");

const router = express.Router();
const demoFundSchema = z.object({ walletId: z.string().trim().min(1), amount: z.coerce.number().positive().max(1000000) });

// Explicit development-only funding for the sandbox ledger. This endpoint is
// mounted only when ENABLE_DEV_ROUTES=true and never calls a payment provider.
router.post("/demo/fund", requireAuth, async (request, response, next) => {
  try {
    if (!environment.demoMoneyMode) return response.status(403).json({ message: "DEMO_MONEY_MODE=true is required." });
    const input = demoFundSchema.parse(request.body);
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    const wallet = await Wallet.findOneAndUpdate(
      { _id: input.walletId, user: user._id, provider: "circle", status: "active" },
      { $inc: { availableBalance: input.amount } },
      { returnDocument: "after" }
    );
    if (!wallet) return response.status(404).json({ message: "Wallet not found or not owned by user." });
    const transaction = await Transaction.create({
      reference: `tn_demo_fund_${crypto.randomUUID()}`,
      user: user._id,
      type: "payin",
      asset: "USDC",
      amount: String(input.amount),
      status: "simulated",
      isSimulation: true,
      destinationWallet: wallet._id,
      provider: "sandbox-ledger",
      metadata: { simulation: true, reason: "developer demo funding" },
    });
    return response.status(201).json({ message: "Demo USDC funded. No real money or stablecoin was created.", walletId: wallet._id, availableBalance: String(wallet.availableBalance), transaction });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

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

