const environment = require("../../config/environment");

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
};
