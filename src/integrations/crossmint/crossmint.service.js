const { crossmintRequest } = require("./crossmint.client");

/**
 * Crossmint Provider Service
 * Encapuslates direct interactions with Crossmint APIs.
 */
class CrossmintService {
  /**
   * Provision a Crossmint wallet for a user if required.
   * POST /api/v1-alpha1/wallets
   */
  async createWallet({ email, chain = "polygon-amoy" }) {
    if (!email) {
      throw new Error("Email is required for Crossmint wallet provisioning.");
    }
    const data = await crossmintRequest("/api/v1-alpha1/wallets", {
      method: "POST",
      body: JSON.stringify({ email, chain }),
    });

    return {
      publicKey: data.publicKey || data.address || data.id,
      chain,
      raw: data,
    };
  }

  /**
   * Create an off-ramp payment method (e.g. ACH bank account).
   * POST /api/2022-06-09/offramp/payment-methods
   * SECURITY: Bank details are securely transmitted to Crossmint without logging.
   */
  async createPaymentMethod({ type = "ach", beneficiary, bankAccount }) {
    if (!beneficiary || !bankAccount) {
      throw new Error("Beneficiary and bankAccount information are required.");
    }

    const payload = {
      type,
      beneficiary,
      bankAccount,
    };

    const data = await crossmintRequest("/api/2022-06-09/offramp/payment-methods", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      paymentMethodId: data.id || data.paymentMethodId,
      type: data.type || type,
      status: data.status,
      raw: data,
    };
  }

  /**
   * Create an off-ramp order.
   * POST /api/2022-06-09/orders
   */
  async createOfframpOrder({ payment, recipient, lineItems }) {
    if (!payment || !recipient || !lineItems) {
      throw new Error("payment, recipient, and lineItems are required for offramp order creation.");
    }

    const payload = {
      payment,
      recipient,
      lineItems,
    };

    const data = await crossmintRequest("/api/2022-06-09/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      orderId: data.id || data.orderId,
      status: data.status || "created",
      requiresKyc: Boolean(data.status === "requires-kyc" || data.requiresKyc),
      raw: data,
    };
  }

  /**
   * Get off-ramp order status.
   * GET /api/2022-06-09/orders/:orderId
   */
  async getOrderStatus(orderId) {
    const data = await crossmintRequest(`/api/2022-06-09/orders/${orderId}`, {
      method: "GET",
    });

    return {
      orderId: data.id || orderId,
      status: data.status,
      requiresKyc: Boolean(data.status === "requires-kyc" || data.requiresKyc),
      raw: data,
    };
  }
}

module.exports = new CrossmintService();
