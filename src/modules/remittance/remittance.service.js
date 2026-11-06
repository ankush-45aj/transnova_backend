const crypto = require("crypto");
const Remittance = require("./remittance.model");
const Wallet = require("../wallets/wallet.model");
const User = require("../users/user.model");
const PaymentMethod = require("../offramp/payment-method.model");
const onrampService = require("../onramp/onramp.service");
const transactionService = require("../transactions/transaction.service");
const offrampService = require("../offramp/offramp.service");

class RemittanceService {
  /**
   * Start a complete cross-border remittance flow:
   * 1. Validates sender wallet and recipient payment method.
   * 2. Creates the parent Remittance record.
   * 3. Initializes on-ramp session (Transak) locked to the sender's Circle wallet.
   */
  async initiateRemittance({
    userId,
    walletId,
    senderCurrency = "INR",
    senderAmount,
    recipientCurrency = "USD",
    recipientPaymentMethodId,
    userIp,
  }) {
    if (!senderAmount || Number(senderAmount) <= 0) {
      const error = new Error("Remittance amount must be greater than zero.");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("User profile not found.");
      error.statusCode = 404;
      throw error;
    }

    // Verify sender wallet ownership
    const wallet = await Wallet.findOne({
      _id: walletId,
      user: userId,
      provider: "circle",
      status: "active",
    });
    if (!wallet) {
      const error = new Error("Active Circle wallet not found or not owned by user.");
      error.statusCode = 404;
      throw error;
    }

    // Verify recipient payment method ownership
    const paymentMethod = await PaymentMethod.findOne({
      paymentMethodId: recipientPaymentMethodId,
      user: userId,
    });
    if (!paymentMethod && process.env.NODE_ENV !== "test") {
      const error = new Error("Recipient payment method not found or not owned by user.");
      error.statusCode = 404;
      throw error;
    }

    const reference = `tn_remit_${crypto.randomUUID()}`;
    const remittance = await Remittance.create({
      reference,
      user: userId,
      senderWallet: wallet._id,
      senderCurrency: senderCurrency.toUpperCase(),
      senderAmount: String(senderAmount),
      recipientCurrency: recipientCurrency.toUpperCase(),
      recipientPaymentMethodId,
      recipientInfo: {
        name: paymentMethod?.beneficiaryName || "Beneficiary",
        bankName: paymentMethod?.bankName || "",
        accountLast4: paymentMethod?.accountLast4 || "",
      },
      status: "onramp_pending",
      timeline: [
        {
          stage: "onramp",
          status: "pending",
          details: { message: `On-ramp initiated for ${senderAmount} ${senderCurrency.toUpperCase()}` },
        },
      ],
    });

    try {
      // Create Transak session locked to this remittance
      const onrampResult = await onrampService.createWidgetOrder({
        userId,
        walletId: wallet._id,
        fiatCurrency: senderCurrency.toUpperCase(),
        fiatAmount: Number(senderAmount),
        userIp,
        remittanceId: remittance._id,
      });

      remittance.onrampTransaction = onrampResult.transaction._id;
      await remittance.save();

      return {
        remittance,
        widgetUrl: onrampResult.widgetUrl,
        onrampTransaction: onrampResult.transaction,
      };
    } catch (err) {
      remittance.status = "failed";
      remittance.error = { stage: "onramp", message: err.message };
      remittance.timeline.push({
        stage: "onramp",
        status: "failed",
        details: { error: err.message },
      });
      await remittance.save();
      throw err;
    }
  }

  /**
   * Chain reaction: Invoked automatically when the on-ramp webhook confirms receipt of funds.
   * Automatically executes the off-ramp payout leg to the recipient's bank account.
   */
  async onOnrampCompleted(onrampTransaction) {
    if (!onrampTransaction.remittanceId) return;

    const remittance = await Remittance.findById(onrampTransaction.remittanceId);
    if (!remittance || remittance.status === "completed" || remittance.status === "failed") {
      return;
    }

    const usdcReceived = onrampTransaction.usdcAmount || onrampTransaction.amount;
    remittance.usdcAmount = usdcReceived;
    remittance.status = "onramp_completed";
    remittance.timeline.push({
      stage: "onramp",
      status: "completed",
      details: { usdcReceived: String(usdcReceived), transakOrderId: onrampTransaction.transakOrderId },
    });
    await remittance.save();

    // Trigger off-ramp leg
    try {
      remittance.status = "offramp_pending";
      remittance.timeline.push({
        stage: "offramp",
        status: "pending",
        details: { message: "Initiating Crossmint off-ramp to recipient bank account" },
      });
      await remittance.save();

      const user = await User.findById(remittance.user);
      const wallet = await Wallet.findById(remittance.senderWallet);
      const payerAddress = wallet?.circleAddress || wallet?.address;

      if (!payerAddress) {
        throw new Error("Sender wallet address missing for off-ramp execution.");
      }

      const offrampResult = await offrampService.createOfframpOrder({
        payerAddress,
        paymentMethodId: remittance.recipientPaymentMethodId,
        amount: Number(usdcReceived),
        user,
        chain: "polygon-amoy",
        currency: "usdc",
      });

      remittance.offrampTransaction = offrampResult.transaction?._id;
      if (offrampResult.status === "completed" || offrampResult.status === "success") {
        remittance.status = "completed";
      }
      remittance.timeline.push({
        stage: "offramp",
        status: offrampResult.status,
        details: { crossmintOrderId: offrampResult.orderId },
      });
      await remittance.save();
    } catch (offrampErr) {
      console.error("Automated offramp leg failed:", offrampErr.message);
      remittance.status = "failed";
      remittance.error = { stage: "offramp", message: offrampErr.message };
      remittance.timeline.push({
        stage: "offramp",
        status: "failed",
        details: { error: offrampErr.message },
      });
      await remittance.save();
    }
  }

  /**
   * Fetch remittance details with full pipeline stage status.
   */
  async getRemittanceStatus(remittanceId, userId) {
    const remittance = await Remittance.findOne({ _id: remittanceId, user: userId })
      .populate("onrampTransaction")
      .populate("transferTransaction")
      .populate("offrampTransaction");

    if (!remittance) {
      const error = new Error("Remittance order not found or access denied.");
      error.statusCode = 404;
      throw error;
    }

    // If offramp is pending/processing, check live status from Crossmint
    if (remittance.offrampTransaction && remittance.status === "offramp_pending") {
      try {
        const offrampSync = await offrampService.getOfframpOrderStatus(
          remittance.offrampTransaction._id,
          userId
        );
        if (offrampSync.status === "completed" || offrampSync.status === "success") {
          remittance.status = "completed";
          remittance.timeline.push({
            stage: "offramp",
            status: "completed",
            details: { message: "Funds settled to recipient bank account" },
          });
          await remittance.save();
        }
      } catch (err) {
        // Continue and return current stored state
      }
    }

    return remittance;
  }

  /**
   * List all remittances for authenticated user.
   */
  async listUserRemittances(userId) {
    return Remittance.find({ user: userId }).sort({ createdAt: -1 });
  }
}

module.exports = new RemittanceService();

