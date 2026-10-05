const request = require("supertest");
const app = require("../app");
const circleService = require("./circle/circle.service");
const crossmintService = require("./crossmint/crossmint.service");
const walletService = require("../modules/wallets/wallet.service");
const transactionService = require("../modules/transactions/transaction.service");
const offrampService = require("../modules/offramp/offramp.service");
const User = require("../modules/users/user.model");
const Wallet = require("../modules/wallets/wallet.model");
const Transaction = require("../modules/transactions/transaction.model");
const { admin } = require("../config/firebase");

jest.mock("../config/firebase", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "valid-token") {
          return Promise.resolve({ uid: "firebase-test-uid", email: "testuser@example.com" });
        }
        return Promise.reject(new Error("Invalid token"));
      }),
    }),
  },
  initializeFirebase: jest.fn(),
}));

jest.mock("../modules/users/user.model");
jest.mock("../modules/wallets/wallet.model");
jest.mock("../modules/transactions/transaction.model");
jest.mock("./circle/circle.service");
jest.mock("./crossmint/crossmint.service");

describe("Circle & Crossmint Integration Tests", () => {
  const mockUser = {
    _id: "mongo-user-id-123",
    firebaseUid: "firebase-test-uid",
    email: "testuser@example.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockUser);
    User.findById.mockResolvedValue(mockUser);
  });

  describe("Authentication Middleware Protection", () => {
    test("rejects unauthenticated requests to wallet endpoints", async () => {
      const response = await request(app).post("/api/v1/wallets/circle").send({});
      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Firebase ID token is required");
    });

    test("rejects unauthenticated requests to offramp endpoints", async () => {
      const response = await request(app).post("/api/v1/offramp/orders").send({});
      expect(response.status).toBe(401);
    });
  });

  describe("Circle Wallet Routes", () => {
    test("POST /api/v1/wallets/circle creates a developer-controlled wallet", async () => {
      User.findOne.mockResolvedValue(mockUser);
      circleService.createWallet.mockResolvedValue({
        walletId: "circle-wallet-123",
        address: "0x1234567890abcdef1234567890abcdef12345678",
        blockchain: "MATIC-AMOY",
        accountType: "SCA",
      });

      Wallet.findOne.mockResolvedValue(null);
      Wallet.create.mockResolvedValue({
        _id: "mongo-wallet-1",
        circleWalletId: "circle-wallet-123",
        address: "0x1234567890abcdef1234567890abcdef12345678",
      });

      const response = await request(app)
        .post("/api/v1/wallets/circle")
        .set("Authorization", "Bearer valid-token")
        .send({ blockchain: "MATIC-AMOY" });

      expect(response.status).toBe(201);
      expect(response.body.wallet).toBeDefined();
    });

    test("POST /api/v1/wallets/validate-address validates address", async () => {
      circleService.validateAddress.mockResolvedValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        blockchain: "MATIC-AMOY",
        isValid: true,
      });

      const response = await request(app)
        .post("/api/v1/wallets/validate-address")
        .set("Authorization", "Bearer valid-token")
        .send({ address: "0x1234567890abcdef1234567890abcdef12345678" });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(true);
    });
  });

  describe("Circle Transaction Routes", () => {
    test("POST /api/v1/transactions/estimate-fee rejects non-positive amount", async () => {
      const response = await request(app)
        .post("/api/v1/transactions/estimate-fee")
        .set("Authorization", "Bearer valid-token")
        .send({
          walletId: "circle-wallet-123",
          destinationAddress: "0x1234567890abcdef1234567890abcdef12345678",
          amount: -5,
        });

      expect(response.status).toBe(400);
    });

    test("POST /api/v1/transactions/circle-transfer executes transfer", async () => {
      circleService.validateAddress.mockResolvedValue({ isValid: true });
      circleService.getWalletTokenBalance.mockResolvedValue([
        { symbol: "USDC", id: "internal-usdc-uuid-999" },
      ]);
      circleService.executeUsdcTransfer.mockResolvedValue({
        circleTransactionId: "circle-tx-111",
        state: "INITIATED",
        txHash: null,
      });

      Wallet.findOne.mockResolvedValue({
        _id: "mongo-wallet-1",
        circleWalletId: "circle-wallet-123",
      });

      Transaction.create.mockResolvedValue({
        _id: "tx-1",
        reference: "tn_circle_mock",
        save: jest.fn().mockResolvedValue(true),
      });

      const response = await request(app)
        .post("/api/v1/transactions/circle-transfer")
        .set("Authorization", "Bearer valid-token")
        .send({
          walletId: "circle-wallet-123",
          destinationAddress: "0x1234567890abcdef1234567890abcdef12345678",
          amount: 50.0,
        });

      expect(response.status).toBe(201);
      expect(response.body.transaction).toBeDefined();
    });
  });

  describe("Crossmint Off-ramp Routes", () => {
    test("POST /api/v1/offramp/payment-methods creates ACH payment method", async () => {
      crossmintService.createPaymentMethod.mockResolvedValue({
        paymentMethodId: "pm_crossmint_123",
        type: "ach",
        status: "active",
      });

      const response = await request(app)
        .post("/api/v1/offramp/payment-methods")
        .set("Authorization", "Bearer valid-token")
        .send({
          type: "ach",
          beneficiary: {
            name: "Jane Doe",
            email: "jane.doe@example.com",
            address: {
              street1: "100 Main St",
              city: "New York",
              state: "NY",
              postalCode: "10001",
              country: "US",
            },
          },
          bankAccount: {
            accountType: "checking",
            routingNumber: "021000021",
            accountNumber: "1234567890",
            bankName: "Chase Bank",
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.paymentMethodId).toBe("pm_crossmint_123");
    });

    test("POST /api/v1/offramp/orders creates order and validates positive amount", async () => {
      const badAmountRes = await request(app)
        .post("/api/v1/offramp/orders")
        .set("Authorization", "Bearer valid-token")
        .send({
          payerAddress: "0x1234567890abcdef1234567890abcdef12345678",
          paymentMethodId: "pm_crossmint_123",
          amount: 0,
        });

      expect(badAmountRes.status).toBe(400);

      crossmintService.createOfframpOrder.mockResolvedValue({
        orderId: "crossmint-order-999",
        status: "processing",
        requiresKyc: false,
      });

      Transaction.create.mockResolvedValue({
        _id: "tx-offramp-1",
        reference: "tn_offramp_mock",
        status: "processing",
      });

      const goodRes = await request(app)
        .post("/api/v1/offramp/orders")
        .set("Authorization", "Bearer valid-token")
        .send({
          payerAddress: "0x1234567890abcdef1234567890abcdef12345678",
          paymentMethodId: "pm_crossmint_123",
          amount: 100.0,
        });

      expect(goodRes.status).toBe(201);
      expect(goodRes.body.orderId).toBe("crossmint-order-999");
    });
  });
});
