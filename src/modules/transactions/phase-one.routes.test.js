const request = require("supertest");

jest.mock("../../config/firebase", () => ({
  admin: { auth: () => ({ verifyIdToken: jest.fn().mockResolvedValue({ uid: "sender-uid" }) }) },
  initializeFirebase: jest.fn(),
}));
jest.mock("../users/user.model", () => ({ findOne: jest.fn() }));
jest.mock("./transaction.model", () => ({ findOne: jest.fn() }));
jest.mock("./transaction.service", () => ({ executeCircleTransfer: jest.fn() }));

const app = require("../../app");
const User = require("../users/user.model");
const transactionService = require("./transaction.service");
const Transaction = require("./transaction.model");

describe("Phase 1 crypto API contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue({ _id: "sender-id" });
  });

  test("forwards the Flutter idempotency key when starting a transfer", async () => {
    transactionService.executeCircleTransfer.mockResolvedValue({ _id: "tx-1", status: "pending" });
    const response = await request(app).post("/api/v1/transactions/circle-transfer")
      .set("Authorization", "Bearer token")
      .set("Idempotency-Key", "35dca883-3be0-48af-825f-93f9c0302c4e")
      .send({ walletId: "wallet-1", destinationAddress: "0x1111111111111111111111111111111111111111", amount: 1 });
    expect(response.status).toBe(201);
    expect(transactionService.executeCircleTransfer).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "35dca883-3be0-48af-825f-93f9c0302c4e",
    }));
  });

  test("returns an owner-scoped receipt", async () => {
    Transaction.findOne.mockResolvedValue({
      _id: "tx-1", reference: "tn_circle_1", type: "wallet_transfer", status: "completed",
      asset: "USDC", amount: "1", provider: "circle", providerTransactionId: "circle-1",
      circleTxHash: "0xhash", metadata: { sourceAddress: "0xa", destinationAddress: "0xb", network: "MATIC-AMOY" },
    });
    const response = await request(app).get("/api/v1/transactions/tx-1/receipt")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.receipt).toEqual(expect.objectContaining({ status: "completed", network: "MATIC-AMOY", transactionHash: "0xhash" }));
    expect(Transaction.findOne).toHaveBeenCalledWith({ _id: "tx-1", user: "sender-id" });
  });
});
