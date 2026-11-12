const environment = require("../../config/environment");
const crypto = require("crypto");

const safeEqual = (actual, expected) => {
  const actualBuffer = Buffer.from(actual || "");
  const expectedBuffer = Buffer.from(expected || "");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

// Crossmint webhook verification is intentionally fail-closed. The provider (or
// a verified webhook relay) must send HMAC-SHA256(raw body) in this header.
const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!environment.crossmintWebhookSecret || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac("sha256", environment.crossmintWebhookSecret).update(rawBody).digest("hex");
  return safeEqual(signature, expected);
};

/**
 * Crossmint HTTP client wrapper.
 * Makes HTTP requests to Crossmint REST API with required authentication headers.
 */
const crossmintRequest = async (endpoint, options = {}) => {
  const baseUrl = (environment.crossmintBaseUrl || "https://staging.crossmint.com").replace(/\/$/, "");
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = {
    "X-API-KEY": environment.crossmintApiKey || "",
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `Crossmint API error (${response.status}): ${response.statusText}`;
    const error = new Error(errorMsg);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
};

module.exports = {
  crossmintRequest,
  verifyWebhookSignature,
};
