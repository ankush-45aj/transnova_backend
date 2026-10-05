const User = require("../users/user.model");
const Wallet = require("./wallet.model");
const circleService = require("../../integrations/circle/circle.service");

class WalletService {
  /**
   * Create a Circle developer-controlled wallet for a user.
   */
  async createCircleWallet(userId, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("User profile not found.");
      error.statusCode = 404;
      throw error;
    }

    // Check if user already has an active Circle wallet on this blockchain
    const blockchain = options.blockchains?.[0] || "MATIC-AMOY";
    const existingWallet = await Wallet.findOne({
      user: userId,
      provider: "circle",
      circleWalletId: { $exists: true },
      status: "active",
    });

    if (existingWallet && !options.forceNew) {
      return existingWallet;
    }

    const circleResult = await circleService.createWallet({
      accountType: options.accountType || "SCA",
      blockchains: [blockchain],
    });

    const wallet = await Wallet.create({
      user: userId,
      provider: "circle",
      providerWalletId: circleResult.walletId,
      circleWalletId: circleResult.walletId,
      circleAddress: circleResult.address,
      address: circleResult.address,
      asset: "USDC",
      network: blockchain,
      blockchain: blockchain,
      accountType: circleResult.accountType || "SCA",
      status: "active",
    });

    return wallet;
  }

  /**
   * Get wallet token balances and USDC internal token UUID from Circle.
   */
  async getWalletBalance(walletId, userId) {
    let wallet = await Wallet.findOne({
      _id: walletId,
      user: userId,
    });

    if (!wallet) {
      wallet = await Wallet.findOne({
        circleWalletId: walletId,
        user: userId,
      });
    }

    const targetCircleWalletId = wallet ? (wallet.circleWalletId || wallet.providerWalletId) : walletId;
    if (!targetCircleWalletId) {
      const error = new Error("Wallet not found or not associated with a Circle wallet ID.");
      error.statusCode = 404;
      throw error;
    }

    const balances = await circleService.getWalletTokenBalance(targetCircleWalletId);

    let usdcTokenId = null;
    for (const item of balances) {
      const symbol = item.token?.symbol || item.symbol;
      const id = item.token?.id || item.id;
      if (symbol === "USDC" && id) {
        usdcTokenId = id;
        break;
      }
    }

    return {
      walletId: targetCircleWalletId,
      balances,
      usdcTokenId,
    };
  }

  /**
   * Validate a destination blockchain address.
   */
  async validateAddress(address, blockchain = "MATIC-AMOY") {
    if (!address) {
      const error = new Error("Destination address is required.");
      error.statusCode = 400;
      throw error;
    }
    return circleService.validateAddress({ address, blockchain });
  }
}

module.exports = new WalletService();
