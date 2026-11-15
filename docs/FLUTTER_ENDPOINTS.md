# Flutter endpoint handoff

Base URL: `https://<your-render-service>.onrender.com`

Unless marked otherwise, send `Authorization: Bearer <Firebase ID token>` and `Content-Type: application/json`. For every retry-safe money-moving request, generate a UUID `Idempotency-Key` and reuse it only when retrying the same request.

| Method | Endpoint | Body / frontend use |
|---|---|---|
| GET | `/health` | Deployment health check; no auth. |
| POST | `/api/v1/auth/sync` | `{ "displayName": "User A" }`; call once after Firebase sign-in. |
| GET | `/api/v1/auth/me` | Current profile, wallet, and QR. |
| GET | `/api/v1/users/recipient?email=<email>` | Resolve B's public wallet by email. |
| GET | `/api/v1/wallets/me` | Current user's wallet and QR. |
| POST | `/api/v1/wallets/circle` | `{ "blockchain":"MATIC-AMOY", "accountType":"SCA" }`; normally auto-created by sync. |
| GET | `/api/v1/wallets/:walletId/balance` | Current user's balance only. |
| GET | `/api/v1/wallets/:walletId/qr` | Current user's QR only. |
| POST | `/api/v1/wallets/validate-address` | `{ "address":"0x...", "blockchain":"MATIC-AMOY" }`. |
| POST | `/api/v1/transactions/estimate-fee` | `{ "walletId":"...", "destinationAddress":"0x...", "amount":10 }`; show confirmation only after this succeeds. |
| POST | `/api/v1/transactions/circle-transfer` | Same body as fee estimation; send a unique `Idempotency-Key`. In provider sandbox, poll its Circle transaction before showing success. |
| GET | `/api/v1/transactions/circle/:circleTransactionId` | Poll every 3–5 seconds until `state: "COMPLETE"`, `transaction.status: "completed"`, and a transaction hash exist. |
| GET | `/api/v1/transactions/:transactionId/receipt` | Final transaction receipt. |
| GET | `/api/v1/transactions` | Transaction history. Add `?includeSimulated=true` only for local demo QA. |
| POST | `/api/v1/onramp/widget-url` | `{ "walletId":"...", "fiatCurrency":"INR", "fiatAmount":5000 }`; browser clients must also send `Origin: <CLIENT_ORIGIN>`. Open returned `widgetUrl` in a browser/webview. |
| GET | `/api/v1/onramp/transactions/:transactionId` | Poll an on-ramp status. |
| POST | `/api/v1/offramp/payment-methods` | Create recipient ACH method; see `transnova.postman_collection.json` for the full beneficiary/bank JSON shape. |
| GET | `/api/v1/offramp/payment-methods` | List current user's payment methods. |
| POST | `/api/v1/offramp/orders` | `{ "payerAddress":"0x...", "paymentMethodId":"...", "amount":10, "chain":"polygon-amoy", "currency":"usdc" }`; include `Idempotency-Key`. |
| GET | `/api/v1/offramp/orders/:orderId` | Poll the payout provider status. |
| POST | `/api/v1/remittance/initiate` | `{ "walletId":"...", "senderCurrency":"INR", "senderAmount":5000, "recipientCurrency":"USD", "recipientPaymentMethodId":"..." }`. |
| GET | `/api/v1/remittance/:remittanceId` | Remittance progress and timeline. |
| GET | `/api/v1/remittance` | Current user's remittance history. |
| POST | `/api/v1/razorpay/create-order` | `{ "amount":10.5 }`; test merchant collection only, not an A-to-B transfer. |
| POST | `/api/v1/razorpay/verify-payment` | Razorpay checkout callback: order ID, payment ID, signature. |
| GET | `/api/v1/razorpay/payment/:orderId` | Poll Razorpay payment. |
| GET | `/api/v1/razorpay/payment/:orderId/receipt` | Razorpay receipt. |
| GET | `/api/v1/razorpay/history` | Current user's Razorpay history. |

Webhooks are provider-to-server endpoints; do not call them from Flutter. They do not use Firebase bearer authentication:

- `POST /api/v1/onramp/webhooks/transak`
- `POST /api/v1/offramp/webhooks/crossmint`
- `POST /api/v1/razorpay/webhook`

For local-only simulated UX testing, set `DEMO_MONEY_MODE=true` and `ENABLE_DEV_ROUTES=true`; then an internal tester can call `POST /api/v1/dev/demo/fund`. Never expose that endpoint or its mode on Render.
