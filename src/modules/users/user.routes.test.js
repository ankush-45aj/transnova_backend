const request = require("supertest");

jest.mock("../../config/firebase", () => ({
  admin: { auth: () => ({ verifyIdToken: jest.fn().mockResolvedValue({ uid: "sender-uid" }) }) },
  initializeFirebase: jest.fn(),
}));
jest.mock("./user.model", () => ({ findOne: jest.fn() }));
jest.mock("../wallets/wallet.model", () => ({ findOne: jest.fn() }));

const app = require("../../app");
const User = require("./user.model");
const Wallet = require("../wallets/wallet.model");

describe("recipient lookup", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns only public payment details for an active recipient", async () => {
    User.findOne.mockResolvedValue({ _id: "recipient-id", displayName: "User B", email: "b@example.com" });
    Wallet.findOne.mockResolvedValue({ circleAddress: "0x2222222222222222222222222222222222222222", blockchain: "MATIC-AMOY", asset: "USDC" });

    const response = await request(app)
      .get("/api/v1/users/recipient?email=b@example.com")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.recipient).toEqual({
      displayName: "User B",
      walletAddress: "0x2222222222222222222222222222222222222222",
      blockchain: "MATIC-AMOY",
      asset: "USDC",
    });
    expect(User.findOne).toHaveBeenCalledWith({ email: "b@example.com", status: "active" });
  });
});
