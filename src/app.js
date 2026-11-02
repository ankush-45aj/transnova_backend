const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pino = require("pino");
const pinoHttp = require("pino-http");

const environment = require("./config/environment");
const authRoutes = require("./modules/auth/auth.routes");
const transactionRoutes = require("./modules/transactions/transaction.routes");
const walletRoutes = require("./modules/wallets/wallet.routes");
const offrampRoutes = require("./modules/offramp/offramp.routes");
const onrampRoutes = require("./modules/onramp/onramp.routes");
const remittanceRoutes = require("./modules/remittance/remittance.routes");
const devTokenRoutes = require("./modules/auth/dev-token.routes");

const app = express();

if (environment.trustProxy) {
  app.set("trust proxy", environment.trustProxy);
}
app.use(helmet());
app.use(cors({ origin: environment.clientOrigin || false }));
app.use(express.json({ limit: "20kb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/wallets", walletRoutes);
app.use("/api/v1/offramp", offrampRoutes);
app.use("/api/v1/onramp", onrampRoutes);
app.use("/api/v1/remittance", remittanceRoutes);

// DEV ONLY — strictly require both non-production NODE_ENV and explicit ENABLE_DEV_ROUTES flag
if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_ROUTES === "true") {
  app.use("/api/v1/dev", devTokenRoutes);
}

// Global sanitized error handler
app.use((error, _request, response, _next) => {
  console.error("Unhandled error:", error.message || error);
  const status = error.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";
  const message = (status === 500 && isProd)
    ? "Internal server error"
    : (error.message || "Internal server error");

  response.status(status).json({ message });
});

module.exports = app;
