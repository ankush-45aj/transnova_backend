const crypto = require("crypto");
const Transaction = require("../transactions/transaction.model");
const Wallet = require("../wallets/wallet.model");
const crossmintService = require("../../integrations/crossmint/crossmint.service");

class OfframpService {
  /**
   * Create Crossmint off-ramp payment method (e.g. ACH bank account).
   * Ensures raw banking details are transmitted directly to Crossmint without being logged.
   */
  async createPaymentMethod({ type = "ach", beneficiary, bankAccount, user }) {
    if (!beneficiary || !bankAccount) {
      const error = new Error("Beneficiary and bank account details are required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await crossmintService.createPaymentMethod({
      type,
      beneficiary,
      bankAccount,
    });

    return {
      paymentMethodId: result.paymentMethodId,
      type: result.type,
      status: result.status,
    };
  }

  /**
   * Create Crossmint off-ramp order and record transaction in application database.
   */
  async createOfframpOrder({ payerAddress, paymentMethodId, amount, user, chain = "polygon-amoy", currency = "usdc" }) {
    if (!amount || Number(amount) <= 0) {
      const error = new Error("Off-ramp amount must be greater than zero.");
      error.statusCode = 400;
      throw error;
    }

    if (!payerAddress || !paymentMethodId) {
      const error = new Error("payerAddress and paymentMethodId are required.");
      error.statusCode = 400;
      throw error;
    }

    // Prepare Crossmint order payload
    const payment = {
      method: chain,
      currency: currency.toLowerCase(),
      payerAddress,
      receiptEmail: user.email,
    };

    const recipient = {
      paymentMethodId,
    };

    const lineItems = [
      {
        currencyLocator: "fiat:usd",
        executionParameters: {
          mode: "exact-in",
          amount: String(amount),
        },
      },
    ];

    // Execute order creation via Crossmint provider service
    const orderResult = await crossmintService.createOfframpOrder({
      payment,
      recipient,
      lineItems,
    });

    // Map Crossmint order status to application transaction status
    let initialTxStatus = "processing";
    if (orderResult.requiresKyc) {
      initialTxStatus = "pending";
    } else if (orderResult.status === "completed" || orderResult.status === "success") {
      initialTxStatus = "completed";
    } else if (orderResult.status === "failed" || orderResult.status === "rejected") {
      initialTxStatus = "failed";
    }

    // Persist transaction record in MongoDB
    const transaction = await Transaction.create({
      reference: `tn_offramp_${crypto.randomUUID()}`,
      user: user._id,
      type: "offramp",
      asset: currency.toUpperCase(),
      amount: String(amount),
      sourceCurrency: currency.toUpperCase(),
      sourceAmount: String(amount),
      usdcAmount: String(amount),
      destinationCurrency: "USD",
      destinationAmount: String(amount),
      status: initialTxStatus,
      provider: "crossmint",
      crossmintPaymentMethodId: paymentMethodId,
      crossmintOrderId: orderResult.orderId,
      crossmintStatus: orderResult.status,
      metadata: {
        chain,
        payerAddress,
        requiresKyc: orderResult.requiresKyc,
      },
    });

    return {
      orderId: orderResult.orderId,
      status: orderResult.status,
      requiresKyc: orderResult.requiresKyc,
      transaction,
    };
  }
}

module.exports = new OfframpService();
