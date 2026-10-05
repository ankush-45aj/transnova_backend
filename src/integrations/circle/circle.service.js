const crypto = require("crypto");
const { getCircleClient } = require("./circle.client");
const environment = require("../../config/environment");

/**
 * Circle Provider Service
 * Encapuslates direct interactions with Circle Developer-Controlled Wallets API.
 */
class CircleService {
  /**
   * Create a new Circle developer-controlled wallet (SCA on MATIC-AMOY by default).
   */
  async createWallet(options = {}) {
    const client = getCircleClient();
    const walletSetId = options.walletSetId || environment.circleWalletSetId;
    const accountType = options.accountType || "SCA";
    const blockchains = options.blockchains || ["MATIC-AMOY"];

    if (!walletSetId) {
      throw new Error("CIRCLE_WALLET_SET_ID is not configured.");
    }

    const response = await client.createWallets({
      blockchains,
      count: 1,
      walletSetId,
      accountType,
      idempotencyKey: crypto.randomUUID(),
    });

    const wallets = response.data?.wallets || response.wallets || [];
    if (!wallets.length) {
      throw new Error("Circle failed to create wallet: empty wallet array returned.");
    }

    const wallet = wallets[0];
    return {
      walletId: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.accountType,
      state: wallet.state,
      raw: wallet,
    };
  }

  /**
   * List wallets under the configured wallet set ID.
   */
  async listWallets(walletSetId = environment.circleWalletSetId) {
    const client = getCircleClient();
    const response = await client.listWallets({
      walletSetId,
    });
    return response.data?.wallets || response.wallets || [];
  }

  /**
   * Get token balances for a Circle wallet.
   */
  async getWalletTokenBalance(walletId) {
    const client = getCircleClient();
    const response = await client.getWalletTokenBalance({
      walletId,
      includeAll: true,
    });
    return response.data?.tokenBalances || response.tokenBalances || response.data || [];
  }

  /**
   * Extract internal USDC token UUID for a wallet.
   * Circle requires internal token UUID, NOT ERC-20 contract address.
   */
  async extractUsdcTokenId(walletId) {
    const tokenBalances = await this.getWalletTokenBalance(walletId);
    
    for (const item of tokenBalances) {
      const symbol = item.token?.symbol || item.symbol;
      const id = item.token?.id || item.id;
      if (symbol === "USDC" && id) {
        return id;
      }
    }

    throw new Error(`Internal USDC token ID not found in Circle wallet balances for wallet ${walletId}.`);
  }

  /**
   * Validate blockchain destination address.
   */
  async validateAddress({ address, blockchain = "MATIC-AMOY" }) {
    const client = getCircleClient();
    const response = await client.validateAddress({
      address,
      blockchain,
    });
    const isValid = response.data?.isValid ?? response.isValid ?? false;
    return {
      address,
      blockchain,
      isValid: Boolean(isValid),
    };
  }

  /**
   * Estimate transfer fee.
   */
  async estimateTransferFee({ walletId, tokenId, destinationAddress, amounts }) {
    const client = getCircleClient();
    const response = await client.estimateTransferFee({
      walletId,
      tokenId,
      destinationAddress,
      amounts: Array.isArray(amounts) ? amounts.map(String) : [String(amounts)],
    });
    return response.data || response;
  }

  /**
   * Execute USDC transfer from a Circle wallet.
   */
  async executeUsdcTransfer({ walletId, tokenId, destinationAddress, amount }) {
    const client = getCircleClient();
    const response = await client.createTransaction({
      walletId,
      tokenId,
      destinationAddress,
      amounts: [String(amount)],
      fee: {
        type: "LEVEL",
        config: {
          feeLevel: "MEDIUM",
        },
      },
      idempotencyKey: crypto.randomUUID(),
    });

    const tx = response.data?.id ? response.data : (response.data?.transaction || response);
    return {
      circleTransactionId: tx.id,
      state: tx.state || "INITIATED",
      txHash: tx.txHash || null,
      raw: tx,
    };
  }

  /**
   * Get transaction status from Circle.
   */
  async getTransactionStatus(circleTransactionId) {
    const client = getCircleClient();
    const response = await client.getTransaction({
      id: circleTransactionId,
    });
    const tx = response.data?.transaction || response.data || response;
    return {
      circleTransactionId: tx.id || circleTransactionId,
      state: tx.state || tx.status,
      txHash: tx.txHash || tx.transactionHash || null,
      raw: tx,
    };
  }
}

module.exports = new CircleService();
