const request = require("supertest");

jest.mock("../../config/firebase", () => ({ admin: { auth: () => ({ verifyIdToken: jest.fn() }) }, initializeFirebase: jest.fn() }));
jest.mock("../../integrations/crossmint/crossmint.client", () => ({ verifyWebhookSignature: jest.fn() }));
jest.mock("../transactions/transaction.model");
jest.mock("../remittance/remittance.model");

const { verifyWebhookSignature } = require("../../integrations/crossmint/crossmint.client");
const Transaction = require("../transactions/transaction.model");
const app = require("../../app");

describe("Crossmint webhook protection", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects an unsigned webhook before looking up an order", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const response = await request(app)
      .post("/api/v1/offramp/webhooks/crossmint")
      .set("content-type", "application/json")
      .send({ orderId: "order-1", status: "completed" });
    expect(response.status).toBe(401);
    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("deduplicates a verified webhook event", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    Transaction.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app)
      .post("/api/v1/offramp/webhooks/crossmint")
      .set("content-type", "application/json")
      .set("x-crossmint-signature", "valid")
      .set("x-crossmint-event-id", "event-1")
      .send({ orderId: "order-1", status: "completed" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, duplicate: true });
  });
});
