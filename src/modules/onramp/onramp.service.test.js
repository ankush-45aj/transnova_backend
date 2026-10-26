const environment = require("../../config/environment");
const Transaction = require("../transactions/transaction.model");
const Wallet = require("../wallets/wallet.model");
const transakService = require("../../integrations/transak/transak.service");
const onrampService = require("./onramp.service");

jest.mock("../transactions/transaction.model");
jest.mock("../wallets/wallet.model");
jest.mock("../../integrations/transak/transak.service");

describe("OnrampService", () => {
  const originalConfig = {
    transakNetwork: environment.transakNetwork,
    transakCircleBlockchain: environment.transakCircleBlockchain,
    transakApiKey: environment.transakApiKey,
    transakApiSecret: environment.transakApiSecret,
    transakReferrerDomain: environment.transakReferrerDomain,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    environment.transakNetwork = "polygon";
    environment.transakCircleBlockchain = "MATIC-AMOY";
    environment.transakApiKey = "test-api-key";
    environment.transakApiSecret = "test-api-secret";
    environment.transakReferrerDomain = "localhost:3000";
  });

  afterAll(() => {
    environment.transakNetwork = originalConfig.transakNetwork;
    environment.transakCircleBlockchain = originalConfig.transakCircleBlockchain;
    environment.transakApiKey = originalConfig.transakApiKey;
    environment.transakApiSecret = originalConfig.transakApiSecret;
    environment.transakReferrerDomain = originalConfig.transakReferrerDomain;
  });

  test("checks wallet ownership and persists a pending pay-in before returning the widget", async () => {
    const wallet = {
      _id: "wallet-record-id",
      blockchain: "MATIC-AMOY",
      circleAddress: "0xuserwallet",
    };
    const transaction = {
      _id: "transaction-id",
      status: "pending",
      save: jest.fn(),
    };
    Wallet.findOne.mockResolvedValue(wallet);
    Transaction.create.mockResolvedValue(transaction);
    transakService.createWidgetUrl.mockResolvedValue("https://global-stg.transak.com?sessionId=abc");

    const result = await onrampService.createWidgetOrder({
      userId: "owned-user-id",
      walletId: "wallet-record-id",
      fiatCurrency: "USD",
      fiatAmount: 25,
      userIp: "203.0.113.10",
    });

    expect(Wallet.findOne).toHaveBeenCalledWith({
      _id: "wallet-record-id",
      user: "owned-user-id",
      provider: "circle",
      status: "active",
      asset: "USDC",
    });
    expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      user: "owned-user-id",
      type: "payin",
      provider: "transak",
      destinationWallet: "wallet-record-id",
      status: "pending",
      amount: "0",
    }));
    expect(transakService.createWidgetUrl).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress: "0xuserwallet",
      fiatAmount: 25,
      userId: "owned-user-id",
    }));
    expect(result.widgetUrl).toContain("transak.com");
    expect(result.transaction).toBe(transaction);
  });

  test("does not create an order for a wallet not owned by the user", async () => {
    Wallet.findOne.mockResolvedValue(null);

    await expect(onrampService.createWidgetOrder({
      userId: "user-1",
      walletId: "another-users-wallet",
      fiatCurrency: "USD",
      fiatAmount: 25,
      userIp: "203.0.113.10",
    })).rejects.toMatchObject({ statusCode: 404 });

    expect(Transaction.create).not.toHaveBeenCalled();
    expect(transakService.createWidgetUrl).not.toHaveBeenCalled();
  });

  test("updates a transaction only after verifying a Transak completion webhook", async () => {
    const transaction = {
      reference: "tn_transak_test",
      provider: "transak",
      type: "payin",
      status: "pending",
      save: jest.fn(),
    };
    transakService.verifyWebhookData.mockResolvedValue({
      eventID: "ORDER_COMPLETED",
      webhookData: {
        id: "transak-order-id",
        partnerOrderId: "tn_transak_test",
        fiatAmount: 25,
        cryptoAmount: 23.4,
      },
    });
    Transaction.findOne.mockResolvedValue(transaction);

    const result = await onrampService.processWebhook({ data: "signed-jwt" });

    expect(transakService.verifyWebhookData).toHaveBeenCalledWith("signed-jwt");
    expect(Transaction.findOne).toHaveBeenCalledWith({
      reference: "tn_transak_test",
      provider: "transak",
      type: "payin",
    });
    expect(transaction.status).toBe("completed");
    expect(transaction.transakOrderId).toBe("transak-order-id");
    expect(transaction.sourceAmount).toBe("25");
    expect(transaction.amount).toBe("23.4");
    expect(transaction.usdcAmount).toBe("23.4");
    expect(transaction.save).toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  test("does not downgrade a terminal transaction for a late webhook", async () => {
    const transaction = {
      status: "completed",
      save: jest.fn(),
    };
    transakService.verifyWebhookData.mockResolvedValue({
      eventID: "ORDER_PROCESSING",
      webhookData: { partnerOrderId: "tn_transak_test" },
    });
    Transaction.findOne.mockResolvedValue(transaction);

    await onrampService.processWebhook({ data: "signed-jwt" });

    expect(transaction.status).toBe("completed");
    expect(transaction.save).not.toHaveBeenCalled();
  });
});
