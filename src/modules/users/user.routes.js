const express = require("express");
const { z } = require("zod");
const requireAuth = require("../../middlewares/require-auth");
const User = require("./user.model");
const Wallet = require("../wallets/wallet.model");

const router = express.Router();
const recipientSchema = z.object({ email: z.string().trim().email() });

// Intended for the Flutter send screen. It deliberately returns public payment
// information only, never a Firebase UID, phone number, or KYC state.
router.get("/recipient", requireAuth, async (request, response, next) => {
  try {
    const { email } = recipientSchema.parse(request.query);
    const recipient = await User.findOne({ email: email.toLowerCase(), status: "active" });
    if (!recipient) return response.status(404).json({ message: "Recipient was not found." });
    const wallet = await Wallet.findOne({ user: recipient._id, provider: "circle", status: "active" });
    const address = wallet?.circleAddress || wallet?.address;
    if (!address) return response.status(404).json({ message: "Recipient has no active payment wallet." });
    return response.status(200).json({
      recipient: {
        displayName: recipient.displayName || recipient.email,
        walletAddress: address,
        blockchain: wallet.blockchain || wallet.network,
        asset: wallet.asset || "USDC",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) error.statusCode = 400;
    return next(error);
  }
});

module.exports = router;
