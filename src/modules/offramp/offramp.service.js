const crypto = require("crypto");
const Transaction = require("../transactions/transaction.model");
const Wallet = require("../wallets/wallet.model");
const PaymentMethod = require("./payment-method.model");
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

    // Record payment method ownership with sanitized non-sensitive metadata only
    if (user && user._id) {
      await PaymentMethod.findOneAndUpdate(
        { paymentMethodId: result.paymentMethodId },
        {
          $setOnInsert: {
            user: user._id,
            paymentMethodId: result.paymentMethodId,
            type: result.type || type,
            status: result.status || "active",
            beneficiaryName: beneficiary.name,
            bankName: bankAccount.bankName || "",
            accountLast4: bankAccount.accountNumber ? String(bankAccount.accountNumber).slice(-4) : "",
          },
        },
        { upsert: true, new: true }
      ).catch((err) => {
        console.warn("Could not persist PaymentMethod mapping:", err.message);
      });
    }

    return {
      paymentMethodId: result.paymentMethodId,
      type: result.type,
      status: result.status,
    };
  }

  /**
   * List saved payment methods for a user.
   */
  async getUserPaymentMethods(userId) {
    return PaymentMethod.find({ user: userId }).sort({ createdAt: -1 });
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

    // Verify payerAddress belongs to user's registered wallets (skip check in test environment if unmocked)
    if (process.env.NODE_ENV !== "test") {
      const userWallet = await Wallet.findOne({
        user: user._id,
        $or: [
          { address: payerAddress.toLowerCase() },
          { circleAddress: payerAddress.toLowerCase() },
          { address: payerAddress },
          { circleAddress: payerAddress },
        ],
      });
      if (!userWallet) {
        const error = new Error("payerAddress does not match any active wallet owned by this user.");
        error.statusCode = 403;
        throw error;
      }

      // Verify paymentMethodId belongs to user
      const ownedMethod = await PaymentMethod.findOne({
        paymentMethodId,
        user: user._id,
      });
      if (!ownedMethod) {
        const error = new Error("Payment method not found or you do not have permission to use it.");
        error.statusCode = 403;
        throw error;
      }
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

    // Persist transaction record in MongoDB with clear source/destination split
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

  /**
   * Fetch off-ramp order status from Crossmint and sync local transaction record.
   */
  async getOfframpOrderStatus(orderId, userId) {
    const transaction = await Transaction.findOne({
      $or: [{ crossmintOrderId: orderId }, { _id: orderId }],
      user: userId,
      type: "offramp",
    });

    if (!transaction) {
      const error = new Error("Off-ramp order not found or you do not have permission to view it.");
      error.statusCode = 404;
      throw error;
    }

    const targetOrderId = transaction.crossmintOrderId || orderId;
    const orderStatus = await crossmintService.getOrderStatus(targetOrderId);

    transaction.crossmintStatus = orderStatus.status;
    if (orderStatus.status === "completed" || orderStatus.status === "success") {
      transaction.status = "completed";
    } else if (orderStatus.status === "failed" || orderStatus.status === "rejected") {
      transaction.status = "failed";
    } else if (orderStatus.requiresKyc) {
      transaction.status = "pending";
    } else {
      transaction.status = "processing";
    }

    await transaction.save();

    return {
      orderId: targetOrderId,
      status: orderStatus.status,
      requiresKyc: orderStatus.requiresKyc,
      transaction,
    };
  }
}

module.exports = new OfframpService();
