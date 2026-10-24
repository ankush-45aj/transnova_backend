const { initiateDeveloperControlledWalletsClient } = require("@circle-fin/developer-controlled-wallets");
const environment = require("../../config/environment");

let circleClient = null;

/**
 * Returns an instance of the Circle Developer-Controlled Wallets SDK client.
 */
const getCircleClient = () => {
  if (!circleClient) {
    if (!environment.circleApiKey || !environment.circleEntitySecret) {
      console.warn("Circle SDK warning: CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET is not configured.");
    }
    circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: environment.circleApiKey || "",
      entitySecret: environment.circleEntitySecret || "",
    });
  }
  return circleClient;
};

module.exports = {
  getCircleClient,
};
