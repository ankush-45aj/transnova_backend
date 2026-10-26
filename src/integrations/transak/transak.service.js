const crypto = require("crypto");
const environment = require("../../config/environment");
const transakClient = require("./transak.client");

let cachedAccessToken;
let tokenExpiresAt = 0;
let pendingRefresh;

const getAccessToken = async () => {
  if (cachedAccessToken && tokenExpiresAt > Math.floor(Date.now() / 1000) + 60) {
    return cachedAccessToken;
  }

  if (!pendingRefresh) {
    pendingRefresh = transakClient.refreshAccessToken()
      .then(({ accessToken, expiresAt }) => {
        cachedAccessToken = accessToken;
        tokenExpiresAt = expiresAt;
        return accessToken;
      })
      .finally(() => {
        pendingRefresh = undefined;
      });
  }

  return pendingRefresh;
};

const verifyWebhookData = async (token) => {
  if (typeof token !== "string") {
    const error = new Error("Invalid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    const error = new Error("Invalid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (_error) {
    const error = new Error("Invalid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  if (!header || typeof header !== "object" || header.alg !== "HS256"
    || !claims || typeof claims !== "object") {
    const error = new Error("Invalid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  const accessToken = await getAccessToken();
  const expected = crypto.createHmac("sha256", accessToken)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const supplied = Buffer.from(parts[2], "base64url");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    const error = new Error("Invalid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  if ((claims.exp !== undefined && (typeof claims.exp !== "number" || now >= claims.exp))
    || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || now < claims.nbf))) {
    const error = new Error("Expired or not-yet-valid Transak webhook.");
    error.statusCode = 401;
    throw error;
  }

  return claims;
};

class TransakService {
  assertConfigured() {
    if (!environment.transakApiKey || !environment.transakApiSecret
      || !environment.transakReferrerDomain || !environment.transakNetwork) {
      const error = new Error("Transak credentials, widget domain, and network configuration are required.");
      error.statusCode = 503;
      throw error;
    }
  }

  async createWidgetUrl({ userIp, walletAddress, fiatCurrency, fiatAmount, reference, userId }) {
    this.assertConfigured();
    const accessToken = await getAccessToken();
    return transakClient.createWidgetSession({
      accessToken,
      userIp,
      widgetParams: {
        apiKey: environment.transakApiKey,
        referrerDomain: environment.transakReferrerDomain,
        cryptoCurrencyCode: "USDC",
        fiatCurrency,
        fiatAmount,
        network: environment.transakNetwork,
        walletAddress,
        disableWalletAddressForm: true,
        partnerOrderId: reference,
        partnerCustomerId: String(userId),
      },
    });
  }

  async verifyWebhookData(token) {
    return verifyWebhookData(token);
  }
}

module.exports = new TransakService();
