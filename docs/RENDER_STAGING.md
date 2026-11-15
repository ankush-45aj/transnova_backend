# Render sandbox deployment

This project is a sandbox-only service. Deploy it as **staging**, never as a real-money production payment service.

## Deploy

1. Push this repository including `render.yaml`.
2. In Render, create a Blueprint service from the repository.
3. Set every `sync: false` value from `.env.example` in the Render dashboard. Use only Circle, Crossmint, Transak, and Razorpay sandbox/test credentials.
4. Set `CLIENT_ORIGIN` to the deployed Flutter web URL if you have one. Native Flutter apps do not send a browser Origin, but the Transak widget endpoint requires this configured browser origin.
5. After deployment, request `GET https://<render-service>/health`. Expected response: `{ "status": "ok" }`.
6. Configure provider sandbox webhooks to the public Render URLs listed below. Their signatures must be enabled before you treat a provider status as final.

## Required public webhook URLs

- Razorpay: `POST /api/v1/razorpay/webhook`
- Transak: `POST /api/v1/onramp/webhooks/transak`
- Crossmint: `POST /api/v1/offramp/webhooks/crossmint`

Do not expose `ENABLE_DEV_ROUTES=true` or `DEMO_MONEY_MODE=true` on Render. The demo ledger is for local/frontend QA only; it is not provider sandbox money.

## Provider-sandbox A to B verification

1. Sign in two Firebase sandbox users in the Flutter app and call `POST /api/v1/auth/sync` for each.
2. Call `GET /api/v1/wallets/me` for both accounts and record their distinct wallets.
3. Fund A using an approved Circle testnet faucet or a completed Transak sandbox on-ramp. The backend cannot manufacture Circle testnet USDC.
4. Verify A's balance through `GET /api/v1/wallets/:walletId/balance`.
5. Send from A to B through `POST /api/v1/transactions/circle-transfer`, using B's public wallet address and a unique idempotency key.
6. Poll `GET /api/v1/transactions/circle/:circleTransactionId` until `state` is `COMPLETE` and `txHash` exists.
7. Sign in as B and verify B's Circle balance has increased through `GET /api/v1/wallets/:walletId/balance`.

If Circle's faucet returns `403`, the Circle sandbox entity is not allowed to receive faucet funds. Request/test the faucet entitlement with Circle or use an authorized sandbox funding wallet. Do not replace this with demo money when validating provider settlement.
