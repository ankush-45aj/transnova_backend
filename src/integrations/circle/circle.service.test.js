jest.mock("./circle.client", () => ({ getCircleClient: jest.fn() }));

const { getCircleClient } = require("./circle.client");
const circleService = require("./circle.service");

describe("Circle service SDK contract", () => {
  const client = {
    getWalletTokenBalance: jest.fn(),
    estimateTransferFee: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCircleClient.mockReturnValue(client);
  });

  test("uses the Circle SDK's required id field when reading a wallet balance", async () => {
    client.getWalletTokenBalance.mockResolvedValue({ data: { tokenBalances: [] } });

    await circleService.getWalletTokenBalance("circle-wallet-id");

    expect(client.getWalletTokenBalance).toHaveBeenCalledWith({
      id: "circle-wallet-id",
      includeAll: true,
    });
  });

  test("uses the Circle SDK's singular amount field when estimating a fee", async () => {
    client.estimateTransferFee.mockResolvedValue({ data: { low: {} } });

    await circleService.estimateTransferFee({
      walletId: "circle-wallet-id",
      tokenId: "usdc-token-id",
      destinationAddress: "0x1111111111111111111111111111111111111111",
      amount: ["1.25"],
    });

    expect(client.estimateTransferFee).toHaveBeenCalledWith({
      walletId: "circle-wallet-id",
      tokenId: "usdc-token-id",
      destinationAddress: "0x1111111111111111111111111111111111111111",
      amount: ["1.25"],
    });
  });

  test("reports an unfunded wallet as a client error", async () => {
    client.getWalletTokenBalance.mockResolvedValue({ data: { tokenBalances: [] } });

    await expect(circleService.extractUsdcTokenId("circle-wallet-id"))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("Fund the sandbox wallet") });
  });
});
