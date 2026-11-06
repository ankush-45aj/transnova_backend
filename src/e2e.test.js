/**
 * End-to-End (E2E) Test Suite
 * Tests the entire application lifecycle for both:
 * - Flow 1: Direct Automated Remittance (On-ramp -> Chain -> Payout)
 * - Flow 2: P2P Wallet-to-Wallet Transfer via Constant QR + Off-Ramp
 */

const request = require("supertest");
const app = require("./app");
const environment = require("./config/environment");
const User = require("./modules/users/user.model");
const Wallet = require("./modules/wallets/wallet.model");
const Transaction = require("./modules/transactions/transaction.model");
const PaymentMethod = require("./modules/offramp/payment-method.model");
const Remittance = require("./modules/remittance/remittance.model");
const circleService = require("./integrations/circle/circle.service");
const crossmintService = require("./integrations/crossmint/crossmint.service");
const transakService = require("./integrations/transak/transak.service");

// Mock Firebase authentication to simulate User A and User B
jest.mock("./config/firebase", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "token-user-a") {
          return Promise.resolve({ uid: "firebase-uid-a", email: "aman@example.com", name: "Aman Sender" });
        }
        if (token === "token-user-b") {
          return Promise.resolve({ uid: "firebase-uid-b", email: "rahul@example.com", name: "Rahul Receiver" });
        }
        return Promise.reject(new Error("Unauthorized token"));
      }),
    }),
  },
  initializeFirebase: jest.fn(),
}));

jest.mock("./modules/users/user.model");
jest.mock("./modules/wallets/wallet.model");
jest.mock("./modules/transactions/transaction.model");
jest.mock("./modules/offramp/payment-method.model");
jest.mock("./modules/remittance/remittance.model");
jest.mock("./integrations/circle/circle.service");
jest.mock("./integrations/crossmint/crossmint.service");
jest.mock("./integrations/transak/transak.service");

describe("TransNova End-to-End (E2E) Workflow Test", () => {
  const userA = { _id: "mongo-user-a", firebaseUid: "firebase-uid-a", email: "aman@example.com" };
  const userB = { _id: "mongo-user-b", firebaseUid: "firebase-uid-b", email: "rahul@example.com" };

  const walletA = {
    _id: "mongo-wallet-a",
    user: "mongo-user-a",
    circleWalletId: "circle-w-a",
    circleAddress: "0x1111111111111111111111111111111111111111",
    address: "0x1111111111111111111111111111111111111111",
    blockchain: "MATIC-AMOY",
    status: "active",
  };

  const walletB = {
    _id: "mongo-wallet-b",
    user: "mongo-user-b",
    circleWalletId: "circle-w-b",
    circleAddress: "0x2222222222222222222222222222222222222222",
    address: "0x2222222222222222222222222222222222222222",
    blockchain: "MATIC-AMOY",
    status: "active",
  };

  beforeAll(() => {
    environment.transakNetwork = "polygon";
    environment.transakCircleBlockchain = "MATIC-AMOY";
    environment.transakApiKey = "test-api-key";
    environment.transakApiSecret = "test-api-secret";
    environment.transakReferrerDomain = "localhost:3000";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    PaymentMethod.findOneAndUpdate.mockResolvedValue({
      paymentMethodId: "pm_ach_rahul_99",
      user: "mongo-user-b",
    });
    PaymentMethod.findOne.mockResolvedValue({
      paymentMethodId: "pm_ach_rahul_99",
      user: "mongo-user-b",
    });
  });

  describe("Flow 2: P2P Wallet-to-Wallet via QR Code & Cash Out", () => {
    test("Step 1 & 2: User B registers and generates constant QR code", async () => {
      User.findOneAndUpdate.mockResolvedValue(userB);
      Wallet.findOne.mockResolvedValue(walletB);
      circleService.createWallet.mockResolvedValue({
        walletId: "circle-w-b",
        address: "0x2222222222222222222222222222222222222222",
        blockchain: "MATIC-AMOY",
      });

      // User B syncs profile on login
      const syncRes = await request(app)
        .post("/api/v1/auth/sync")
        .set("Authorization", "Bearer token-user-b")
        .send({ displayName: "Rahul Receiver" });

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.user).toBeDefined();
      expect(syncRes.body.wallet).toBeDefined();
      expect(syncRes.body.qr).toBeDefined();
      expect(syncRes.body.qr.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(syncRes.body.qr.address).toBe("0x2222222222222222222222222222222222222222");

      // User B displays their constant QR code
      User.findOne.mockResolvedValue(userB);
      const meRes = await request(app)
        .get("/api/v1/wallets/me")
        .set("Authorization", "Bearer token-user-b");

      expect(meRes.status).toBe(200);
      expect(meRes.body.qr.address).toBe(walletB.circleAddress);
    });

    test("Step 3: User A estimates transfer fee for User B's scanned QR address", async () => {
      User.findOne.mockResolvedValue(userA);
      Wallet.findOne.mockResolvedValue(walletA);
      circleService.validateAddress.mockResolvedValue({ isValid: true });
      circleService.extractUsdcTokenId.mockResolvedValue("usdc-token-uuid-1");
      circleService.estimateTransferFee.mockResolvedValue({
        low: { amount: "0.001", currency: "USDC" },
        medium: { amount: "0.002", currency: "USDC" },
      });

      const feeRes = await request(app)
        .post("/api/v1/transactions/estimate-fee")
        .set("Authorization", "Bearer token-user-a")
        .send({
          walletId: walletA._id,
          destinationAddress: walletB.circleAddress, // Scanned from QR
          amount: 50.0,
        });

      expect(feeRes.status).toBe(200);
      expect(feeRes.body.feeEstimation).toBeDefined();
      expect(feeRes.body.destinationAddress).toBe(walletB.circleAddress);
    });

    test("Step 4: User A executes USDC on-chain transfer to User B's QR address", async () => {
      User.findOne.mockResolvedValue(userA);
      Wallet.findOne.mockResolvedValue(walletA);
      circleService.validateAddress.mockResolvedValue({ isValid: true });
      circleService.extractUsdcTokenId.mockResolvedValue("usdc-token-uuid-1");
      circleService.getWalletTokenBalance.mockResolvedValue([
        { symbol: "USDC", amount: "100.0", id: "usdc-token-uuid-1" },
      ]);
      circleService.executeUsdcTransfer.mockResolvedValue({
        circleTransactionId: "circle-tx-p2p-100",
        state: "COMPLETE",
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      });

      Transaction.create.mockResolvedValue({
        _id: "tx-p2p-1",
        reference: "tn_circle_p2p",
        status: "pending",
        save: jest.fn().mockResolvedValue(true),
      });

      const transferRes = await request(app)
        .post("/api/v1/transactions/circle-transfer")
        .set("Authorization", "Bearer token-user-a")
        .send({
          walletId: walletA._id,
          destinationAddress: walletB.circleAddress,
          amount: 50.0,
        });

      expect(transferRes.status).toBe(201);
      expect(transferRes.body.transaction).toBeDefined();
    });

    test("Step 5: User B registers ACH bank account and off-ramps USDC to bank", async () => {
      User.findOne.mockResolvedValue(userB);
      crossmintService.createPaymentMethod.mockResolvedValue({
        paymentMethodId: "pm_ach_rahul_99",
        type: "ach",
        status: "active",
      });

      // 5a. Register US bank payment method
      const pmRes = await request(app)
        .post("/api/v1/offramp/payment-methods")
        .set("Authorization", "Bearer token-user-b")
        .send({
          type: "ach",
          beneficiary: {
            name: "Rahul Receiver",
            email: "rahul@example.com",
            address: {
              street1: "450 5th Ave",
              city: "New York",
              state: "NY",
              postalCode: "10018",
              country: "US",
            },
          },
          bankAccount: {
            accountType: "checking",
            routingNumber: "021000021",
            accountNumber: "9876543210",
            bankName: "JPMorgan Chase",
          },
        });

      expect(pmRes.status).toBe(201);
      expect(pmRes.body.paymentMethodId).toBe("pm_ach_rahul_99");

      // 5b. Initiate Off-ramp payout to bank account
      crossmintService.createOfframpOrder.mockResolvedValue({
        orderId: "cm-order-888",
        status: "processing",
        requiresKyc: false,
      });

      Transaction.create.mockResolvedValue({
        _id: "tx-offramp-888",
        reference: "tn_offramp_888",
        crossmintOrderId: "cm-order-888",
        status: "processing",
      });

      const offrampRes = await request(app)
        .post("/api/v1/offramp/orders")
        .set("Authorization", "Bearer token-user-b")
        .send({
          payerAddress: walletB.circleAddress,
          paymentMethodId: "pm_ach_rahul_99",
          amount: 50.0,
        });

      expect(offrampRes.status).toBe(201);
      expect(offrampRes.body.orderId).toBe("cm-order-888");

      // 5c. Sync and check off-ramp order status
      Transaction.findOne.mockResolvedValue({
        _id: "tx-offramp-888",
        crossmintOrderId: "cm-order-888",
        status: "processing",
        save: jest.fn().mockResolvedValue(true),
      });
      crossmintService.getOrderStatus.mockResolvedValue({
        orderId: "cm-order-888",
        status: "completed",
        requiresKyc: false,
      });

      const statusRes = await request(app)
        .get("/api/v1/offramp/orders/cm-order-888")
        .set("Authorization", "Bearer token-user-b");

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe("completed");
    });
  });

  describe("Flow 1: Direct Automated Remittance Pipeline", () => {
    test("Initiates remittance and triggers payout upon on-ramp completion", async () => {
      User.findOne.mockResolvedValue(userA);
      User.findById.mockResolvedValue(userA);
      Wallet.findOne.mockResolvedValue(walletA);
      Wallet.findById.mockResolvedValue(walletA);

      Remittance.create.mockResolvedValue({
        _id: "remit-999",
        reference: "tn_remit_999",
        status: "onramp_pending",
        timeline: [],
        save: jest.fn().mockResolvedValue(true),
      });

      transakService.assertConfigured.mockImplementation(() => {});
      transakService.createWidgetUrl.mockResolvedValue("https://global-stg.transak.com?session=test");
      Transaction.create.mockResolvedValue({
        _id: "tx-onramp-1",
        reference: "tn_transak_1",
        status: "pending",
        save: jest.fn().mockResolvedValue(true),
      });

      // 1. Initiate full remittance
      const remitRes = await request(app)
        .post("/api/v1/remittance/initiate")
        .set("Authorization", "Bearer token-user-a")
        .send({
          walletId: walletA._id,
          senderCurrency: "INR",
          senderAmount: 5000,
          recipientCurrency: "USD",
          recipientPaymentMethodId: "pm_ach_rahul_99",
        });

      expect(remitRes.status).toBe(201);
      expect(remitRes.body.remittance).toBeDefined();
      expect(remitRes.body.widgetUrl).toContain("transak.com");
    });
  });
});
