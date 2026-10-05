const crypto = require("crypto");
const Transaction = require("./transaction.model");
const Wallet = require("../wallets/wallet.model");
const circleService = require("../../integrations/circle/circle.service");

class TransactionService {
  /**
   * Estimate transfer fee for Circle USDC transfer.
   */
  async estimateFee({ walletId, destinationAddress, amount, userId }) {
    if (!amount || Number(amount) <= 0) {
      const error = new Error("Amount must be greater than zero.");
      error.statusCode = 400;
      throw error;
    }

    // 1. Validate destination address
    const validation = await circleService.validateAddress({ address: destinationAddress });
    if (!validation.isValid) {
      const error = new Error("Invalid destination blockchain address.");
      error.statusCode = 400;
      throw error;
    }

    // 2. Obtain internal USDC token UUID
    const tokenId = await circleService.extractUsdcTokenId(walletId);

    // 3. Estimate transfer fee
    const feeEstimation = await circleService.estimateTransferFee({
      walletId,
      tokenId,
      destinationAddress,
      amounts: [amount],
    });

    return {
      walletId,
      destinationAddress,
      amount,
      feeEstimation,
    };
  }

  /**
   * Execute Circle USDC transfer.
   */
  async executeCircleTransfer({ walletId, destinationAddress, amount, userId }) {
    if (!amount || Number(amount) <= 0) {
      const error = new Error("Transfer amount must be greater than zero.");
      error.statusCode = 400;
      throw error;
    }

    // 1. Validate destination address
    const validation = await circleService.validateAddress({ address: destinationAddress });
    if (!validation.isValid) {
      const error = new Error("Invalid destination blockchain address.");
      error.statusCode = 400;
      throw error;
    }

    // 2. Verify wallet ownership and obtain internal USDC token UUID
    let wallet = await Wallet.findOne({ _id: walletId, user: userId });
    if (!wallet) {
      wallet = await Wallet.findOne({ circleWalletId: walletId, user: userId });
    }

    const targetCircleWalletId = wallet ? (wallet.circleWalletId || wallet.providerWalletId) : walletId;
    const tokenId = await circleService.extractUsdcTokenId(targetCircleWalletId);

    // 3. Create transaction record in database
    const transaction = await Transaction.create({
      reference: `tn_circle_${crypto.randomUUID()}`,
      user: userId,
      type: "wallet_transfer",
      asset: "USDC",
      amount: String(amount),
      status: "pending",
      circleWalletId: targetCircleWalletId,
      sourceWallet: wallet ? wallet._id : undefined,
      provider: "circle",
      sourceCurrency: "USDC",
      sourceAmount: String(amount),
      usdcAmount: String(amount),
      destinationCurrency: "USDC",
      destinationAmount: String(amount),
      metadata: { destinationAddress },
    });

    try {
      // 4. Execute USDC transfer via Circle SDK
      const transferResult = await circleService.executeUsdcTransfer({
        walletId: targetCircleWalletId,
        tokenId,
        destinationAddress,
        amount,
      });

      // 5. Save Circle transaction ID and status
      transaction.circleTransactionId = transferResult.circleTransactionId;
      transaction.providerTransactionId = transferResult.circleTransactionId;
      transaction.circleStatus = transferResult.state;
      transaction.circleTxHash = transferResult.txHash || undefined;
      transaction.status = transferResult.state === "COMPLETE" ? "completed" : "pending";
      await transaction.save();

      return transaction;
    } catch (err) {
      transaction.status = "failed";
      transaction.circleStatus = "FAILED";
      transaction.error = { message: err.message, details: err.details || null };
      await transaction.save();
      throw err;
    }
  }

  /**
   * Get Circle transaction status and update application transaction state.
   */
  async getCircleTransactionStatus(circleTransactionId, userId) {
    const statusResult = await circleService.getTransactionStatus(circleTransactionId);
    const { state, txHash } = statusResult;

    const query = { circleTransactionId };
    if (userId) query.user = userId;

    let transaction = await Transaction.findOne(query);

    if (transaction) {
      transaction.circleStatus = state;
      if (txHash) {
        transaction.circleTxHash = txHash;
      }

      // Only mark application transaction as completed when Circle confirms state === "COMPLETE" and txHash is available
      if (state === "COMPLETE" && txHash) {
        transaction.status = "completed";
      } else if (state === "FAILED" || state === "CANCELLED") {
        transaction.status = "failed";
      } else {
        transaction.status = "processing";
      }

      await transaction.save();
    }

    return {
      circleTransactionId,
      state,
      txHash,
      transaction,
    };
  }
}

module.exports = new TransactionService();
