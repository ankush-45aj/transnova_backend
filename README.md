# TransNova Backend

Secure, compliant cross-border remittance backend connecting local fiat payments (INR via UPI/IMPS) with stablecoin rails (USDC on Polygon) and US domestic banking payouts (ACH/FedNow).

---

## 1. End-to-End Remittance Flow

```
[Sender, India]  pays INR (UPI/IMPS)
      │
[On-ramp]  INR → USDC  (Transak hosted widget, locked to user's Circle wallet)
      │
[Pipeline] Automated webhook triggers next leg on verified ORDER_COMPLETED
      │
[Chain]    USDC transfer on Polygon (Circle Developer-Controlled SCA Wallets)
      │
[Off-ramp] USDC → USD → Recipient US bank account (Crossmint ACH payout)
```

1. **Client Auth**: Frontend signs in via Firebase Authentication and includes `Authorization: Bearer <ID_TOKEN>`.
2. **Profile & Wallet Setup**: `POST /api/v1/auth/sync` registers the user in MongoDB. `POST /api/v1/wallets/circle` provisions a developer-controlled smart contract wallet (SCA).
3. **Recipient Setup**: `POST /api/v1/offramp/payment-methods` registers the beneficiary bank account. Raw sensitive banking details are transmitted directly to Crossmint; only non-sensitive metadata is stored locally.
4. **Initiate Remittance**: `POST /api/v1/remittance/initiate` creates a multi-leg remittance order and returns a single-use Transak widget session locked to the user's wallet.
5. **Automated Pipeline**: When Transak sends the HMAC-verified `ORDER_COMPLETED` webhook, the Remittance orchestrator automatically initiates the Crossmint off-ramp order.
6. **Track Progress**: `GET /api/v1/remittance/:remittanceId` returns real-time status across all legs with an audit timeline.

---

## 2. API Endpoints

| Module | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **System** | `GET` | `/health` | Server health check |
| **Auth** | `POST` | `/api/v1/auth/sync` | Sync Firebase user profile to MongoDB |
| | `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & KYC status |
| **Dev Helpers** *(Non-prod)* | `POST` | `/api/v1/dev/firebase-signup` | Create user and return ID token (requires `ENABLE_DEV_ROUTES=true`) |
| | `POST` | `/api/v1/dev/firebase-token` | Sign in user and return ID token (requires `ENABLE_DEV_ROUTES=true`) |
| **Wallets** | `POST` | `/api/v1/wallets/circle` | Create/provision Circle SCA wallet (`forceNew` supported) |
| | `GET` | `/api/v1/wallets/:walletId/balance` | Query live balances from Circle SDK (ownership enforced) |
| | `POST` | `/api/v1/wallets/validate-address` | Validate destination blockchain address |
| **Transactions** | `POST` | `/api/v1/transactions/estimate-fee` | Estimate transfer fees (ownership enforced) |
| | `POST` | `/api/v1/transactions/circle-transfer` | Execute on-chain USDC transfer (balance & ownership checked) |
| | `GET` | `/api/v1/transactions/circle/:circleTransactionId` | Check and sync Circle transfer status (ownership enforced) |
| | `POST` | `/api/v1/transactions/simulate` | Record simulated dummy transaction (`status: simulated`) |
| | `GET` | `/api/v1/transactions` | List transaction history (`?includeSimulated=true` optional) |
| **On-Ramp (Transak)** | `POST` | `/api/v1/onramp/widget-url` | Generate single-use widget session locked to user wallet |
| | `GET` | `/api/v1/onramp/transactions/:transactionId` | View user on-ramp transaction |
| | `POST` | `/api/v1/onramp/webhooks/transak` | HMAC signature verified & replay-protected webhook receiver |
| **Off-Ramp (Crossmint)** | `POST` | `/api/v1/offramp/payment-methods` | Register ACH bank account beneficiary |
| | `GET` | `/api/v1/offramp/payment-methods` | List authenticated user's saved payment methods |
| | `POST` | `/api/v1/offramp/orders` | Create off-ramp payout order (ownership enforced) |
| | `GET` | `/api/v1/offramp/orders/:orderId` | Live status sync with Crossmint |
| | `POST` | `/api/v1/offramp/webhooks/crossmint` | Webhook receiver for order status events |
| **Remittance Pipeline** | `POST` | `/api/v1/remittance/initiate` | Start orchestrated end-to-end cross-border remittance |
| | `GET` | `/api/v1/remittance/:remittanceId` | Track end-to-end multi-leg status & timeline |
| | `GET` | `/api/v1/remittance` | List user's remittance history |

---

## 3. Security & Reliability Highlights

- **Strict User Ownership**: All wallet operations, balance lookups, fee estimations, transfer executions, and order queries verify that the target wallet and transactions belong to the requesting user.
- **Pre-transfer Balance Verification**: Wallet balance is queried prior to dispatching transfers to Circle, preventing failed transaction pollution.
- **Transak Webhook Replay Protection**: Strict `exp` timestamp validation combined with event ID deduplication (`processedWebhookEvents`) prevents replay attacks.
- **Sensitive Data Privacy**: Raw bank account and routing numbers are sent directly to provider APIs and are never stored in cleartext in the database.
- **Fail-Fast Database Boot**: Server refuses to start with an unreachable MongoDB connection in production.
- **Dev Route Isolation**: Non-production token endpoints require an explicit `ENABLE_DEV_ROUTES=true` environment flag.
- **Sanitized Error Responses**: Internal stack traces, database exceptions, and third-party API errors are stripped from production 500 responses.

---

## 4. Setup & Running

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in MONGO_URI, FIREBASE_SERVICE_ACCOUNT_JSON, CIRCLE_*, CROSSMINT_*, TRANSAK_*

# 3. Run automated tests
npm test

# 4. Start development server
npm run dev
```

---

## 5. Regulatory & Compliance Framework

- **India (RBI / FEMA / PMLA)**:
  - Outward retail remittances operate under the Liberalised Remittance Scheme (LRS).
  - Virtual Digital Asset (VDA) operations must adhere to FIU-IND reporting obligations and PMLA rules.
  - Remittances require Form A2 declaration and TCS compliance above applicable thresholds.
- **United States (FinCEN / State MSB)**:
  - Payouts via US domestic rails (ACH/FedNow) require operating under licensed Money Transmitter / MSB partners (e.g. Crossmint / Bridge).
  - Originator and beneficiary verification adheres to the FATF Travel Rule.
