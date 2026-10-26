const request = require("supertest");
const app = require("../../app");
const User = require("../users/user.model");
const onrampService = require("./onramp.service");

jest.mock("../../config/environment", () => ({
  clientOrigin: "http://localhost:3000",
}));

jest.mock("../../config/firebase", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "valid-token") return Promise.resolve({ uid: "firebase-test-uid" });
        return Promise.reject(new Error("Invalid token"));
      }),
    }),
  },
  initializeFirebase: jest.fn(),
}));

jest.mock("../users/user.model");
jest.mock("./onramp.service");

describe("Transak on-ramp routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue({ _id: "mongo-user-id" });
  });

  test("requires Firebase authentication", async () => {
    const response = await request(app)
      .post("/api/v1/onramp/widget-url")
      .set("Origin", "http://localhost:3000")
      .send({ walletId: "wallet-1", fiatAmount: 25 });

    expect(response.status).toBe(401);
    expect(onrampService.createWidgetOrder).not.toHaveBeenCalled();
  });

  test("rejects requests from an unconfigured browser origin", async () => {
    const response = await request(app)
      .post("/api/v1/onramp/widget-url")
      .set("Authorization", "Bearer valid-token")
      .set("Origin", "https://not-the-client.example")
      .send({ walletId: "wallet-1", fiatAmount: 25 });

    expect(response.status).toBe(403);
    expect(onrampService.createWidgetOrder).not.toHaveBeenCalled();
  });

  test("validates amount before starting a provider session", async () => {
    const response = await request(app)
      .post("/api/v1/onramp/widget-url")
      .set("Authorization", "Bearer valid-token")
      .set("Origin", "http://localhost:3000")
      .send({ walletId: "wallet-1", fiatAmount: 0 });

    expect(response.status).toBe(400);
    expect(onrampService.createWidgetOrder).not.toHaveBeenCalled();
  });

  test("creates a widget URL for an authenticated user", async () => {
    onrampService.createWidgetOrder.mockResolvedValue({
      transaction: { _id: "transaction-1", status: "pending" },
      widgetUrl: "https://global-stg.transak.com?sessionId=test-session",
    });

    const response = await request(app)
      .post("/api/v1/onramp/widget-url")
      .set("Authorization", "Bearer valid-token")
      .set("Origin", "http://localhost:3000")
      .send({ walletId: "wallet-1", fiatCurrency: "usd", fiatAmount: 25 });

    expect(response.status).toBe(201);
    expect(response.body.transaction.status).toBe("pending");
    expect(response.body.widgetUrl).toContain("transak.com");
    expect(onrampService.createWidgetOrder).toHaveBeenCalledWith(expect.objectContaining({
      userId: "mongo-user-id",
      walletId: "wallet-1",
      fiatCurrency: "USD",
      fiatAmount: 25,
    }));
  });

  test("does not reveal transactions belonging to another user", async () => {
    onrampService.getUserTransaction.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/v1/onramp/transactions/transaction-1")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(404);
    expect(onrampService.getUserTransaction).toHaveBeenCalledWith("transaction-1", "mongo-user-id");
  });
});
