const request = require("supertest");
const app = require("./app");
const environment = require("./config/environment");
const User = require("./modules/users/user.model");
const Wallet = require("./modules/wallets/wallet.model");
const Transaction = require("./modules/transactions/transaction.model");
const PaymentMethod = require("./modules/offramp/payment-method.model");
const Remittance = require("./modules/remittance/remittance.model");
const RazorpayPayment = require("./modules/razorpay/razorpay-payment.model");
const circleService = require("./integrations/circle/circle.service");
const crossmintService = require("./integrations/crossmint/crossmint.service");
const transakService = require("./integrations/transak/transak.service");
const razorpayService = require("./modules/razorpay/razorpay.service");

jest.setTimeout(15000);

jest.mock("./config/firebase", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "valid-token") {
          return Promise.resolve({ uid: "firebase-test-uid", email: "tester@example.com", name: "Test User" });
        }
        return Promise.reject(new Error("Unauthorized"));
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
jest.mock("./modules/razorpay/razorpay-payment.model");
jest.mock("./integrations/circle/circle.service");
jest.mock("./integrations/crossmint/crossmint.service");
jest.mock("./integrations/transak/transak.service");
jest.mock("./modules/razorpay/razorpay.service");

describe("All Routes Comprehensive Test Suite", () => {
  const mockUser = {
    _id: "mongo-user-id",
    firebaseUid: "firebase-test-uid",
    email: "tester@example.com",
    displayName: "Test User",
    kycStatus: "verified",
  };

  const mockWallet = {
    _id: "mongo-wallet-id",
    user: "mongo-user-id",
    circleWalletId: "circle-wallet-123",
    providerWalletId: "circle-wallet-123",
    circleAddress: "0x3333333333333333333333333333333333333333",
    address: "0x3333333333333333333333333333333333333333",
    blockchain: "MATIC-AMOY",
    network: "MATIC-AMOY",
    asset: "USDC",
    provider: "circle",
    status: "active",
  };

  beforeAll(() => {
    environment.clientOrigin = "http://localhost:3000";
    environment.transakApiKey = "test-transak-key";
    environment.transakApiSecret = "test-transak-secret";
    environment.transakReferrerDomain = "localhost:3000";
    environment.transakNetwork = "polygon";
    environment.transakCircleBlockchain = "MATIC-AMOY";
    environment.sandboxBlockchain = "MATIC-AMOY";
    environment.requireKycForMoneyMovement = false;
    environment.requireIdempotencyKeys = false;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockUser);
    User.findById.mockResolvedValue(mockUser);
    User.findOneAndUpdate.mockResolvedValue(mockUser);

    Wallet.findOne.mockResolvedValue(mockWallet);
    Wallet.findById.mockResolvedValue(mockWallet);
    Wallet.find.mockResolvedValue([mockWallet]);
    Wallet.create.mockResolvedValue(mockWallet);

    PaymentMethod.findOne.mockResolvedValue({
      paymentMethodId: "cpm_test_123",
      user: "mongo-user-id",
      status: "active",
    });

    circleService.validateAddress.mockResolvedValue({ isValid: true });
    circleService.extractUsdcTokenId.mockResolvedValue("usdc-token-uuid");
    circleService.getWalletTokenBalance.mockResolvedValue([
      { token: { symbol: "USDC", id: "usdc-token-uuid" }, amount: "100.00" },
    ]);
  });

  // ==========================================
  // 1. Health Check
  // ==========================================
  describe("Health Check", () => {
    test("GET /health returns 200 OK", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  // ==========================================
  // 2. Auth Routes
  // ==========================================
  describe("Auth Routes", () => {
    test("POST /api/v1/auth/sync requires auth", async () => {
      const res = await request(app).post("/api/v1/auth/sync").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/auth/sync succeeds with token", async () => {
      circleService.createWallet.mockResolvedValue({
        id: "circle-wallet-123",
        address: "0x3333333333333333333333333333333333333333",
        blockchain: "MATIC-AMOY",
      });
      const res = await request(app)
        .post("/api/v1/auth/sync")
        .set("Authorization", "Bearer valid-token")
        .send({ displayName: "Test User" });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    test("GET /api/v1/auth/me requires auth", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/auth/me succeeds with token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });
  });

  // ==========================================
  // 3. Wallet Routes
  // ==========================================
  describe("Wallet Routes", () => {
    test("GET /api/v1/wallets/me requires auth", async () => {
      const res = await request(app).get("/api/v1/wallets/me");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/wallets/me succeeds with token", async () => {
      const res = await request(app)
        .get("/api/v1/wallets/me")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.wallet).toBeDefined();
    });

    test("GET /api/v1/wallets/:id/qr requires auth", async () => {
      const res = await request(app).get("/api/v1/wallets/circle-wallet-123/qr");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/wallets/:id/qr returns QR Data URL", async () => {
      const res = await request(app)
        .get("/api/v1/wallets/circle-wallet-123/qr")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.qr).toBeDefined();
    });

    test("POST /api/v1/wallets/circle requires auth", async () => {
      const res = await request(app).post("/api/v1/wallets/circle").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/wallets/circle succeeds with token", async () => {
      circleService.createWallet.mockResolvedValue({
        id: "circle-wallet-123",
        address: "0x3333333333333333333333333333333333333333",
        blockchain: "MATIC-AMOY",
      });
      const res = await request(app)
        .post("/api/v1/wallets/circle")
        .set("Authorization", "Bearer valid-token")
        .send({ blockchain: "MATIC-AMOY" });
      expect(res.status).toBe(201);
      expect(res.body.wallet).toBeDefined();
    });

    test("GET /api/v1/wallets/:id/balance requires auth", async () => {
      const res = await request(app).get("/api/v1/wallets/circle-wallet-123/balance");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/wallets/:id/balance succeeds with token", async () => {
      const res = await request(app)
        .get("/api/v1/wallets/circle-wallet-123/balance")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.balances).toBeDefined();
    });

    test("POST /api/v1/wallets/validate-address requires auth", async () => {
      const res = await request(app).post("/api/v1/wallets/validate-address").send({ address: "0x123" });
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/wallets/validate-address succeeds with token", async () => {
      circleService.validateAddress.mockResolvedValue({ isValid: true });
      const res = await request(app)
        .post("/api/v1/wallets/validate-address")
        .set("Authorization", "Bearer valid-token")
        .send({ address: "0x3333333333333333333333333333333333333333", blockchain: "MATIC-AMOY" });
      expect(res.status).toBe(200);
      expect(res.body.isValid).toBe(true);
    });
  });

  // ==========================================
  // 4. Transaction Routes
  // ==========================================
  describe("Transaction Routes", () => {
    test("POST /api/v1/transactions/estimate-fee requires auth", async () => {
      const res = await request(app).post("/api/v1/transactions/estimate-fee").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/transactions/estimate-fee succeeds with token", async () => {
      circleService.estimateTransferFee.mockResolvedValue({ low: "0.01", medium: "0.02", high: "0.03" });
      const res = await request(app)
        .post("/api/v1/transactions/estimate-fee")
        .set("Authorization", "Bearer valid-token")
        .send({
          walletId: "circle-wallet-123",
          destinationAddress: "0x4444444444444444444444444444444444444444",
          amount: 10,
        });
      expect(res.status).toBe(200);
      expect(res.body.feeEstimation).toBeDefined();
    });

    test("POST /api/v1/transactions/circle-transfer requires auth", async () => {
      const res = await request(app).post("/api/v1/transactions/circle-transfer").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/transactions/circle-transfer succeeds with token", async () => {
      circleService.executeUsdcTransfer.mockResolvedValue({ id: "circle-tx-999", state: "PENDING" });
      Transaction.create.mockResolvedValue({
        _id: "mongo-tx-id",
        reference: "ref-123",
        status: "processing",
        amount: "10",
        save: jest.fn().mockResolvedValue(true),
      });
      const res = await request(app)
        .post("/api/v1/transactions/circle-transfer")
        .set("Authorization", "Bearer valid-token")
        .set("idempotency-key", "test-transfer-key")
        .send({
          walletId: "circle-wallet-123",
          destinationAddress: "0x4444444444444444444444444444444444444444",
          amount: 10,
        });
      expect(res.status).toBe(201);
      expect(res.body.transaction).toBeDefined();
    });

    test("GET /api/v1/transactions/:id/receipt requires auth", async () => {
      const res = await request(app).get("/api/v1/transactions/mongo-tx-id/receipt");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/transactions/:id/receipt succeeds with token", async () => {
      Transaction.findOne.mockResolvedValue({
        _id: "mongo-tx-id",
        reference: "ref-123",
        type: "wallet_transfer",
        status: "completed",
        asset: "USDC",
        amount: "10",
        user: "mongo-user-id",
      });
      const res = await request(app)
        .get("/api/v1/transactions/mongo-tx-id/receipt")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.receipt).toBeDefined();
    });

    test("GET /api/v1/transactions/circle/:id requires auth", async () => {
      const res = await request(app).get("/api/v1/transactions/circle/circle-tx-999");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/transactions/circle/:id succeeds with token", async () => {
      Transaction.findOne.mockResolvedValue({
        _id: "mongo-tx-id",
        circleTransactionId: "circle-tx-999",
        user: "mongo-user-id",
        status: "processing",
        save: jest.fn().mockResolvedValue(true),
      });
      circleService.getTransactionStatus.mockResolvedValue({ state: "COMPLETE", txHash: "0xhash" });
      const res = await request(app)
        .get("/api/v1/transactions/circle/circle-tx-999")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("COMPLETE");
    });

    test("POST /api/v1/transactions/simulate requires auth", async () => {
      const res = await request(app).post("/api/v1/transactions/simulate").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/transactions/simulate succeeds with token", async () => {
      Transaction.create.mockResolvedValue({
        _id: "sim-tx-id",
        status: "simulated",
        isSimulation: true,
      });
      const res = await request(app)
        .post("/api/v1/transactions/simulate")
        .set("Authorization", "Bearer valid-token")
        .send({ type: "payin", amount: 50, asset: "USDC" });
      expect(res.status).toBe(201);
      expect(res.body.transaction).toBeDefined();
    });

    test("GET /api/v1/transactions requires auth", async () => {
      const res = await request(app).get("/api/v1/transactions");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/transactions succeeds with token", async () => {
      Transaction.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([{ _id: "tx-1", amount: "10" }]),
      });
      const res = await request(app)
        .get("/api/v1/transactions")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
    });
  });

  // ==========================================
  // 5. On-Ramp Routes
  // ==========================================
  describe("On-Ramp Routes", () => {
    test("POST /api/v1/onramp/widget-url requires auth and origin check", async () => {
      const res = await request(app).post("/api/v1/onramp/widget-url").send({});
      expect(res.status).toBe(401);

      const resNoOrigin = await request(app)
        .post("/api/v1/onramp/widget-url")
        .set("Authorization", "Bearer valid-token")
        .send({ walletId: "circle-wallet-123", fiatAmount: 100 });
      expect(resNoOrigin.status).toBe(403);
    });

    test("POST /api/v1/onramp/widget-url succeeds with valid token and origin", async () => {
      transakService.createWidgetUrl.mockResolvedValue("https://global-stg.transak.com?session=123");
      Transaction.create.mockResolvedValue({
        _id: "onramp-tx-1",
        status: "pending",
        reference: "ref-onramp",
      });
      const res = await request(app)
        .post("/api/v1/onramp/widget-url")
        .set("Authorization", "Bearer valid-token")
        .set("Origin", "http://localhost:3000")
        .send({ walletId: "circle-wallet-123", fiatAmount: 100, fiatCurrency: "INR" });
      expect(res.status).toBe(201);
      expect(res.body.widgetUrl).toBeDefined();
    });

    test("GET /api/v1/onramp/transactions/:id requires auth", async () => {
      const res = await request(app).get("/api/v1/onramp/transactions/onramp-tx-1");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/onramp/transactions/:id succeeds with token", async () => {
      Transaction.findOne.mockResolvedValue({
        _id: "onramp-tx-1",
        type: "payin",
        status: "pending",
      });
      const res = await request(app)
        .get("/api/v1/onramp/transactions/onramp-tx-1")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.transaction).toBeDefined();
    });
  });

  // ==========================================
  // 6. Off-Ramp Routes
  // ==========================================
  describe("Off-Ramp Routes", () => {
    test("POST /api/v1/offramp/payment-methods requires auth", async () => {
      const res = await request(app).post("/api/v1/offramp/payment-methods").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/offramp/payment-methods succeeds with valid token", async () => {
      crossmintService.createPaymentMethod.mockResolvedValue({
        paymentMethodId: "cpm_test_123",
        type: "ach",
        status: "active",
      });
      PaymentMethod.findOneAndUpdate.mockResolvedValue({
        paymentMethodId: "cpm_test_123",
        user: "mongo-user-id",
        type: "ach",
        status: "active",
      });
      const res = await request(app)
        .post("/api/v1/offramp/payment-methods")
        .set("Authorization", "Bearer valid-token")
        .send({
          type: "ach",
          beneficiary: {
            name: "John Doe",
            email: "john@example.com",
            address: { street1: "123 Main St", city: "SF", state: "CA", postalCode: "94105", country: "US" },
          },
          bankAccount: {
            accountType: "checking",
            routingNumber: "121000358",
            accountNumber: "123456789",
            bankName: "Wells Fargo",
          },
        });
      expect(res.status).toBe(201);
      expect(res.body.paymentMethodId).toBe("cpm_test_123");
    });

    test("GET /api/v1/offramp/payment-methods requires auth", async () => {
      const res = await request(app).get("/api/v1/offramp/payment-methods");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/offramp/payment-methods succeeds with token", async () => {
      PaymentMethod.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          { paymentMethodId: "cpm_test_123", bankName: "Wells Fargo", accountLast4: "6789" },
        ]),
      });
      const res = await request(app)
        .get("/api/v1/offramp/payment-methods")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.paymentMethods).toHaveLength(1);
    });

    test("POST /api/v1/offramp/orders requires auth", async () => {
      const res = await request(app).post("/api/v1/offramp/orders").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/offramp/orders succeeds with token", async () => {
      PaymentMethod.findOne.mockResolvedValue({
        paymentMethodId: "cpm_test_123",
        user: "mongo-user-id",
      });
      crossmintService.createOfframpOrder.mockResolvedValue({
        orderId: "cpm_order_999",
        status: "pending",
        requiresKyc: false,
      });
      Transaction.create.mockResolvedValue({
        _id: "offramp-tx-1",
        status: "pending",
      });
      const res = await request(app)
        .post("/api/v1/offramp/orders")
        .set("Authorization", "Bearer valid-token")
        .send({
          payerAddress: "0x3333333333333333333333333333333333333333",
          paymentMethodId: "cpm_test_123",
          amount: 25,
        });
      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe("cpm_order_999");
    });

    test("GET /api/v1/offramp/orders/:id requires auth", async () => {
      const res = await request(app).get("/api/v1/offramp/orders/cpm_order_999");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/offramp/orders/:id succeeds with token", async () => {
      Transaction.findOne.mockResolvedValue({
        _id: "offramp-tx-1",
        crossmintOrderId: "cpm_order_999",
        user: "mongo-user-id",
        status: "completed",
        save: jest.fn().mockResolvedValue(true),
      });
      crossmintService.getOrderStatus.mockResolvedValue({
        orderId: "cpm_order_999",
        status: "completed",
      });
      const res = await request(app)
        .get("/api/v1/offramp/orders/cpm_order_999")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");
    });
  });

  // ==========================================
  // 7. Remittance Routes (Flow 1)
  // ==========================================
  describe("Remittance Pipeline Routes", () => {
    test("POST /api/v1/remittance/initiate requires auth", async () => {
      const res = await request(app).post("/api/v1/remittance/initiate").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/remittance/initiate succeeds with token", async () => {
      Transaction.create.mockResolvedValue({
        _id: "tx-onramp",
        status: "pending",
        save: jest.fn().mockResolvedValue(true),
      });
      Remittance.create.mockResolvedValue({
        _id: "remit-order-1",
        reference: "ref-remit-1",
        status: "onramp_pending",
        timeline: [],
        save: jest.fn().mockResolvedValue(true),
      });
      transakService.createWidgetUrl.mockResolvedValue("https://global-stg.transak.com?session=remit");

      const res = await request(app)
        .post("/api/v1/remittance/initiate")
        .set("Authorization", "Bearer valid-token")
        .set("Origin", "http://localhost:3000")
        .send({
          walletId: "circle-wallet-123",
          senderAmount: 5000,
          senderCurrency: "INR",
          recipientCurrency: "USD",
          recipientPaymentMethodId: "cpm_test_123",
        });
      expect(res.status).toBe(201);
      expect(res.body.remittance).toBeDefined();
      expect(res.body.widgetUrl).toBeDefined();
    });

    test("GET /api/v1/remittance/:id requires auth", async () => {
      const res = await request(app).get("/api/v1/remittance/remit-order-1");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/remittance/:id succeeds with token", async () => {
      Remittance.findOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue({
              _id: "remit-order-1",
              status: "onramp_pending",
              user: "mongo-user-id",
            }),
          }),
        }),
      });
      const res = await request(app)
        .get("/api/v1/remittance/remit-order-1")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.remittance).toBeDefined();
    });

    test("GET /api/v1/remittance requires auth", async () => {
      const res = await request(app).get("/api/v1/remittance");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/remittance succeeds with token", async () => {
      Remittance.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([{ _id: "remit-order-1", status: "onramp_pending" }]),
      });
      const res = await request(app)
        .get("/api/v1/remittance")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.remittances).toHaveLength(1);
    });
  });

  // ==========================================
  // 8. Razorpay Routes
  // ==========================================
  describe("Razorpay Domestic Routes", () => {
    test("POST /api/v1/razorpay/create-order requires auth", async () => {
      const res = await request(app).post("/api/v1/razorpay/create-order").send({ amount: 100 });
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/razorpay/create-order succeeds with token", async () => {
      razorpayService.createOrder.mockResolvedValue({
        razorpayOrderId: "rzp_order_123",
        amount: 10000,
        currency: "INR",
      });
      const res = await request(app)
        .post("/api/v1/razorpay/create-order")
        .set("Authorization", "Bearer valid-token")
        .send({ amount: 100 });
      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe("rzp_order_123");
    });

    test("POST /api/v1/razorpay/verify-payment requires auth", async () => {
      const res = await request(app).post("/api/v1/razorpay/verify-payment").send({});
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/razorpay/verify-payment succeeds with token and valid signature", async () => {
      razorpayService.verifyPayment.mockResolvedValue({
        razorpayOrderId: "rzp_order_123",
        razorpayPaymentId: "pay_123",
        status: "captured",
      });
      const res = await request(app)
        .post("/api/v1/razorpay/verify-payment")
        .set("Authorization", "Bearer valid-token")
        .send({
          razorpay_order_id: "rzp_order_123",
          razorpay_payment_id: "pay_123",
          razorpay_signature: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        });
      expect(res.status).toBe(200);
      expect(res.body.payment).toBeDefined();
    });

    test("GET /api/v1/razorpay/history requires auth", async () => {
      const res = await request(app).get("/api/v1/razorpay/history");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/razorpay/history succeeds with token", async () => {
      RazorpayPayment.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([{ razorpayOrderId: "rzp_order_123" }]),
      });
      const res = await request(app)
        .get("/api/v1/razorpay/history")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(1);
    });
  });

  // ==========================================
  // 9. Users Directory Route
  // ==========================================
  describe("Users Directory Route", () => {
    test("GET /api/v1/users/recipient requires auth", async () => {
      const res = await request(app).get("/api/v1/users/recipient?email=recipient@example.com");
      expect(res.status).toBe(401);
    });

    test("GET /api/v1/users/recipient succeeds with token", async () => {
      User.findOne.mockResolvedValue({
        _id: "recipient-id",
        email: "recipient@example.com",
        displayName: "Recipient User",
        status: "active",
      });
      Wallet.findOne.mockResolvedValue({
        user: "recipient-id",
        circleAddress: "0x5555555555555555555555555555555555555555",
        blockchain: "MATIC-AMOY",
        asset: "USDC",
      });
      const res = await request(app)
        .get("/api/v1/users/recipient?email=recipient@example.com")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(200);
      expect(res.body.recipient.walletAddress).toBe("0x5555555555555555555555555555555555555555");
    });
  });
});
