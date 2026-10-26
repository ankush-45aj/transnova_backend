const environment = require("../../config/environment");

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(`Transak request failed with status ${response.status}.`);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  return body;
};

const refreshAccessToken = async () => {
  const apiKey = environment.transakApiKey;
  const apiSecret = environment.transakApiSecret;
  if (!apiKey || !apiSecret) {
    const error = new Error("Transak API credentials are not configured.");
    error.statusCode = 503;
    throw error;
  }

  const baseUrl = environment.transakBaseUrl.replace(/\/$/, "");
  const response = await requestJson(`${baseUrl}/partners/api/v2/refresh-token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-secret": apiSecret,
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ apiKey }),
  });

  const accessToken = response.data?.accessToken;
  const expiresAt = Number(response.data?.expiresAt);
  if (typeof accessToken !== "string" || !accessToken || !Number.isFinite(expiresAt)) {
    const error = new Error("Transak returned an invalid access token response.");
    error.statusCode = 502;
    throw error;
  }

  return { accessToken, expiresAt };
};

const createWidgetSession = async ({ accessToken, userIp, widgetParams }) => {
  const apiKey = environment.transakApiKey;
  if (!apiKey) {
    const error = new Error("Transak API credentials are not configured.");
    error.statusCode = 503;
    throw error;
  }

  const baseUrl = environment.transakGatewayBaseUrl.replace(/\/$/, "");
  const response = await requestJson(`${baseUrl}/api/v2/auth/session`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "access-token": accessToken,
      "x-api-key": apiKey,
      "x-user-ip": userIp,
      "content-type": "application/json",
    },
    body: JSON.stringify({ widgetParams }),
  });

  const widgetUrl = response.data?.widgetUrl;
  if (typeof widgetUrl !== "string" || !widgetUrl) {
    const error = new Error("Transak returned an invalid widget session response.");
    error.statusCode = 502;
    throw error;
  }

  return widgetUrl;
};

module.exports = { refreshAccessToken, createWidgetSession };
