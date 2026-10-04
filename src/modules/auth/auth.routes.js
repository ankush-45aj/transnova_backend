const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("../users/user.model");
const Wallet = require("../wallets/wallet.model");

const router = express.Router();
const profileSchema = z.object({ displayName: z.string().trim().max(100).optional() });

router.post("/sync", requireAuth, async (request, response, next) => {
  try {
    const body = profileSchema.parse(request.body);
    const user = await User.findOneAndUpdate(
      { firebaseUid: request.auth.uid },
      { $set: { email: request.auth.email || "", displayName: body.displayName ?? request.auth.name ?? "", phoneNumber: request.auth.phone_number } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await Wallet.findOneAndUpdate(
      { user: user._id, asset: "USDC", network: "placeholder" },
      { $setOnInsert: { user: user._id, asset: "USDC", network: "placeholder", provider: "placeholder" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    response.status(200).json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    next(error);
  }
});

router.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await User.findOne({ firebaseUid: request.auth.uid });
    if (!user) return response.status(404).json({ message: "User profile not found. Call POST /auth/sync first." });
    return response.status(200).json({ user });
  } catch (error) { return next(error); }
});

module.exports = router;
