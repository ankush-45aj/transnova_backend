const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pino = require("pino");
const pinoHttp = require("pino-http");

const authRoutes = require("./modules/auth/auth.routes");
const transactionRoutes = require("./modules/transactions/transaction.routes");
const walletRoutes = require("./modules/wallets/wallet.routes");
const offrampRoutes = require("./modules/offramp/offramp.routes");
const devTokenRoutes = require("./modules/auth/dev-token.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "20kb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_request, response) => response.status(200).json({ status: "ok" }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/wallets", walletRoutes);
app.use("/api/v1/offramp", offrampRoutes);
// DEV ONLY — remove or comment out before production
if (process.env.NODE_ENV !== "production") {
  app.use("/api/v1/dev", devTokenRoutes);
}

app.use((error, _request, response, _next) => {
  console.error("Unhandled error:", error.message || error);
  const status = error.statusCode || 500;
  response.status(status).json({ message: error.message || "Internal server error" });
});

module.exports = app;
