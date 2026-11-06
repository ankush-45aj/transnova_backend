const request = require("supertest");

jest.mock("../../config/environment", () => ({
  clientOrigin: "http://localhost:3000",
  razorpayKeyId: "rzp_test_key",
  razorpayWebhookSecret: "webhook-secret",
}));
jest.mock("../../config/firebase", () => ({
  admin: { auth: () => ({ verifyIdToken: jest.fn().mockResolvedValue({ uid: "firebase-test-uid" }) }) },
  initializeFirebase: jest.fn(),
}));
jest.mock("../users/user.model", () => ({ findOne: jest.fn() }));
jest.mock("./razorpay-payment.model", () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock("./razorpay.service", () => ({ createOrder: jest.fn(), verifyPayment: jest.fn(), processWebhook: jest.fn() }));

const app = require("../../app");
const User = require("../users/user.model");
const paymentService = require("./razorpay.service");

describe("Razorpay routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue({ _id: "mongo-user-id", firebaseUid: "firebase-test-uid" });
  });

  test("requires Firebase authentication to create an order", async () => {
    const response = await request(app).post("/api/razorpay/create-order").send({ amount: 50 });
    expect(response.status).toBe(401);
    expect(paymentService.createOrder).not.toHaveBeenCalled();
  });

  test("rejects an invalid order amount", async () => {
    const response = await request(app).post("/api/razorpay/create-order")
      .set("Authorization", "Bearer valid-token").send({ amount: 0 });
    expect(response.status).toBe(400);
    expect(paymentService.createOrder).not.toHaveBeenCalled();
  });

  test("creates an order using the Firebase user's existing MongoDB profile", async () => {
    paymentService.createOrder.mockResolvedValue({ razorpayOrderId: "order_test", amount: 5000, currency: "INR" });
    const response = await request(app).post("/api/razorpay/create-order")
      .set("Authorization", "Bearer valid-token").send({ amount: 50 });
    expect(response.status).toBe(201);
    expect(response.body.orderId).toBe("order_test");
    expect(paymentService.createOrder).toHaveBeenCalledWith({ user: expect.objectContaining({ _id: "mongo-user-id" }), amount: 50 });
  });
});
