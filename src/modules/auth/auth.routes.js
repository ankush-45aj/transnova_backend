const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const Wallet = require("../wallets/wallet.model");
const walletService = require("../wallets/wallet.service");

const router = express.Router();
const profileSchema = z.object({ displayName: z.string().trim().max(100).optional() });

/**
 * POST /api/v1/auth/sync
 * Sync user from Firebase auth and automatically provision their permanent Circle wallet + constant QR code.
 */
router.post("/sync", requireAuth, async (request, response, next) => {
  try {
    const body = profileSchema.parse(request.body);
    const user = await User.findOneAndUpdate(
      { firebaseUid: request.auth.uid },
      {
        $set: {
          email: request.auth.email || "",
          displayName: body.displayName ?? request.auth.name ?? "",
          phoneNumber: request.auth.phone_number,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Auto-provision permanent Circle wallet upon registration/sync
    let wallet = null;
    let qr = null;
    try {
      wallet = await walletService.createCircleWallet(user._id, { blockchain: "MATIC-AMOY" });
      qr = await walletService.generateWalletQR(wallet);
    } catch (walletErr) {
      console.warn("Auto Circle wallet provisioning during sync deferred:", walletErr.message);
      wallet = await Wallet.findOne({ user: user._id, status: "active" });
      if (wallet?.circleAddress) {
        qr = await walletService.generateWalletQR(wallet).catch(() => null);
      }
    }

    return response.status(200).json({ user, wallet, qr });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 * Fetch authenticated user profile along with their permanent Circle wallet and QR code.
 */
router.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });

    const walletData = await walletService.getUserPrimaryWallet(user._id);

    return response.status(200).json({
      user,
      wallet: walletData?.wallet || null,
      qr: walletData?.qr || null,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
