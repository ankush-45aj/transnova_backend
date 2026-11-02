const request = require("supertest");
const app = require("../../app");
const User = require("../users/user.model");
const remittanceService = require("./remittance.service");

jest.mock("../../config/firebase", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "valid-token") return Promise.resolve({ uid: "firebase-remit-uid" });
        return Promise.reject(new Error("Invalid token"));
      }),
    }),
  },
  initializeFirebase: jest.fn(),
}));

jest.mock("../users/user.model");
jest.mock("./remittance.service");

describe("Remittance Pipeline Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue({ _id: "mongo-remit-user", firebaseUid: "firebase-remit-uid" });
  });

  test("requires authentication for initiating a remittance", async () => {
    const res = await request(app)
      .post("/api/v1/remittance/initiate")
      .send({ walletId: "w1", senderAmount: 100, recipientPaymentMethodId: "pm1" });

    expect(res.status).toBe(401);
  });

  test("rejects invalid or non-positive amount", async () => {
    const res = await request(app)
      .post("/api/v1/remittance/initiate")
      .set("Authorization", "Bearer valid-token")
      .send({ walletId: "w1", senderAmount: 0, recipientPaymentMethodId: "pm1" });

    expect(res.status).toBe(400);
  });

  test("successfully initiates end-to-end remittance session", async () => {
    remittanceService.initiateRemittance.mockResolvedValue({
      remittance: {
        _id: "remit-order-1",
        reference: "tn_remit_123",
        status: "onramp_pending",
      },
      widgetUrl: "https://global-stg.transak.com?sessionId=remit-session",
    });

    const res = await request(app)
      .post("/api/v1/remittance/initiate")
      .set("Authorization", "Bearer valid-token")
      .send({
        walletId: "w1",
        senderCurrency: "INR",
        senderAmount: 5000,
        recipientCurrency: "USD",
        recipientPaymentMethodId: "pm1",
      });

    expect(res.status).toBe(201);
    expect(res.body.remittance._id).toBe("remit-order-1");
    expect(res.body.widgetUrl).toContain("transak.com");
  });

  test("GET /api/v1/remittance/:remittanceId fetches order status", async () => {
    remittanceService.getRemittanceStatus.mockResolvedValue({
      _id: "remit-order-1",
      status: "onramp_pending",
    });

    const res = await request(app)
      .get("/api/v1/remittance/remit-order-1")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.remittance.status).toBe("onramp_pending");
  });

  test("GET /api/v1/remittance lists user remittances", async () => {
    remittanceService.listUserRemittances.mockResolvedValue([
      { _id: "remit-1", status: "completed" },
    ]);

    const res = await request(app)
      .get("/api/v1/remittance")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.remittances).toHaveLength(1);
  });
});

