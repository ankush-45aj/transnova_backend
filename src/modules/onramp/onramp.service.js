const crypto = require("crypto");
const net = require("net");
const environment = require("../../config/environment");
const Transaction = require("../transactions/transaction.model");
const Wallet = require("../wallets/wallet.model");
const transakService = require("../../integrations/transak/transak.service");

const webhookStatus = {
  ORDER_CREATED: "pending",
  ORDER_PAYMENT_VERIFYING: "processing",
  ORDER_PROCESSING: "processing",
  ORDER_COMPLETED: "completed",
  ORDER_FAILED: "failed",
  ORDER_REFUNDED: "cancelled",
  ORDER_EXPIRED: "cancelled",
};

class OnrampService {
  async createWidgetOrder({ userId, walletId, fiatCurrency, fiatAmount, userIp }) {
    if (!net.isIP(userIp)) {
      const error = new Error("A valid client IP address is required to start a Transak session.");
      error.statusCode = 400;
      throw error;
    }

    transakService.assertConfigured();

    if (!environment.transakCircleBlockchain) {
      const error = new Error("Transak Circle blockchain configuration is required.");
      error.statusCode = 503;
      throw error;
    }

    const wallet = await Wallet.findOne({
      _id: walletId,
      user: userId,
      provider: "circle",
      status: "active",
      asset: "USDC",
    });

    if (!wallet) {
      const error = new Error("Active USDC Circle wallet not found for this user.");
      error.statusCode = 404;
      throw error;
    }

    const walletBlockchain = wallet.blockchain || wallet.network;
    if (walletBlockchain?.toLowerCase() !== environment.transakCircleBlockchain.toLowerCase()) {
      const error = new Error("The selected Circle wallet is not on the configured Transak receiving blockchain.");
      error.statusCode = 400;
      throw error;
    }

    const walletAddress = wallet.circleAddress || wallet.address;
    if (!walletAddress) {
      const error = new Error("The selected wallet has no receiving address.");
      error.statusCode = 400;
      throw error;
    }

    const reference = `tn_transak_${crypto.randomUUID()}`;
    const transaction = await Transaction.create({
      reference,
      user: userId,
      type: "payin",
      asset: "USDC",
      amount: "0",
      status: "pending",
      destinationWallet: wallet._id,
      provider: "transak",
      sourceCurrency: fiatCurrency,
      sourceAmount: String(fiatAmount),
      destinationCurrency: "USDC",
      metadata: { network: environment.transakNetwork },
    });

    try {
      const widgetUrl = await transakService.createWidgetUrl({
        userIp,
        walletAddress,
        fiatCurrency,
        fiatAmount,
        reference,
        userId,
      });

      return { transaction, widgetUrl };
    } catch (error) {
      transaction.status = "failed";
      transaction.error = { message: error.message };
      await transaction.save();
      throw error;
    }
  }

  async processWebhook(body) {
    const claims = await transakService.verifyWebhookData(body?.data);
    const webhookData = claims.webhookData;
    const eventId = claims.eventID;
    const reference = webhookData?.partnerOrderId;
    const status = webhookStatus[eventId];

    if (!reference || typeof reference !== "string" || !status) {
      const error = new Error("Transak webhook is missing a recognized order reference or event.");
      error.statusCode = 400;
      throw error;
    }

    const transaction = await Transaction.findOne({
      reference,
      provider: "transak",
      type: "payin",
    });
    if (!transaction) {
      const error = new Error("Transak order reference was not found.");
      error.statusCode = 404;
      throw error;
    }

    const isTerminal = ["completed", "failed", "cancelled"].includes(transaction.status);
    if (!isTerminal) {
      transaction.status = status;
      transaction.transakStatus = eventId;
      if (webhookData.id) transaction.transakOrderId = String(webhookData.id);
      if (webhookData.fiatAmount !== undefined && Number.isFinite(Number(webhookData.fiatAmount))
        && Number(webhookData.fiatAmount) > 0) {
        transaction.sourceAmount = String(webhookData.fiatAmount);
      }
      if (webhookData.cryptoAmount !== undefined && Number.isFinite(Number(webhookData.cryptoAmount))
        && Number(webhookData.cryptoAmount) > 0) {
        transaction.amount = String(webhookData.cryptoAmount);
        transaction.usdcAmount = String(webhookData.cryptoAmount);
        transaction.destinationAmount = String(webhookData.cryptoAmount);
      }
      await transaction.save();
    }

    return { received: true };
  }

  async getUserTransaction(transactionId, userId) {
    return Transaction.findOne({
      _id: transactionId,
      user: userId,
      type: "payin",
      provider: "transak",
    });
  }
}

module.exports = new OnrampService();
