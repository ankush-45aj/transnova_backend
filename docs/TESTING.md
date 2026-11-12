# Backend verification guide

## 1. Local static and unit verification

1. Copy `.env.example` to `.env`; do not commit `.env`.
2. Set `NODE_ENV=development`, `ENABLE_DEV_ROUTES=true`, `REQUIRE_KYC_FOR_MONEY_MOVEMENT=false`, and use only sandbox credentials.
3. Install exactly what the lockfile specifies: `npm ci`.
4. Run `npm run check`. It rejects unresolved merge conflicts, invalid `package.json`, and invalid JavaScript syntax.
5. Run `npm test`. All tests must pass. The test suite opens a local loopback server through Supertest.
6. Run `npm run audit:prod`. Investigate and remediate every high or critical production dependency finding before deployment.
7. Start the API with `npm run dev`, then request `GET http://localhost:5000/health`. Expected response: `{ "status": "ok" }`.

## 2. Razorpay domestic-payment sandbox flow

Razorpay is independent from crypto/remittance flows.

1. Use Razorpay test credentials and keep `RAZORPAY_MODE=test`.
2. Obtain a Firebase ID token and create/sync the user through `POST /api/v1/auth/sync`.
3. Call `POST /api/v1/razorpay/create-order` with `Authorization: Bearer <token>`, a unique `Idempotency-Key`, and `{ "amount": 10.00 }`.
4. Open Razorpay Flutter Checkout with the returned `checkout` object (`key`, `orderId`, paise `amount`, `currency`); make a test UPI/card payment.
5. Send the returned order ID, payment ID, and signature to `POST /api/v1/razorpay/verify-payment`.
6. Configure the Razorpay sandbox webhook to `/api/v1/razorpay/webhook`; use the same webhook secret as `RAZORPAY_WEBHOOK_SECRET`.
7. Confirm `GET /api/v1/razorpay/payment/<orderId>` returns `captured`. This proves domestic collection only; it does not transfer crypto or initiate an ACH payout.

## 3. Crypto remittance sandbox flow

1. Use matching Circle, Transak, and Crossmint sandbox credentials. Configure a single supported sandbox chain in `TRANSAK_NETWORK` and `TRANSAK_CIRCLE_BLOCKCHAIN`.
2. Sync a Firebase user and provision its Circle wallet. Confirm `GET /api/v1/wallets/me` returns the expected sandbox-chain address.
3. Create the US beneficiary payment method with `POST /api/v1/offramp/payment-methods`.
4. Start `POST /api/v1/remittance/initiate` with the user wallet, INR amount, and that payment method ID. Confirm the returned Transak widget points to the expected sandbox environment and locks the receiving wallet address.
5. Complete a provider-supported sandbox on-ramp. Verify the Transak webhook is accepted and the local on-ramp transaction becomes completed.
6. Confirm the remittance shows an associated payout order only once, even if the Transak webhook is redelivered.
7. Configure the Crossmint webhook relay to send `x-crossmint-signature` as `HMAC-SHA256(raw request body, CROSSMINT_WEBHOOK_SECRET)` and a stable `x-crossmint-event-id`. Confirm unsigned requests receive 401 and a valid completed webhook advances the remittance to `completed`.
8. Reconcile the provider dashboard, the on-chain transaction/hash, local transaction record, and recipient bank sandbox result. All four must agree before treating a payout as settled.

## 3a. Flutter User A to User B USDC flow

1. Authenticate both Firebase users and call `POST /api/v1/auth/sync` once for each.
2. User B calls `GET /api/v1/wallets/me` and displays `qr.qrCodeDataUrl` or shares `qr.address`.
3. User A either scans that address or calls `GET /api/v1/users/recipient?email=<user-b-email>` to obtain User B's public wallet address.
4. User A calls `POST /api/v1/transactions/estimate-fee` with their wallet, recipient address, and amount.
5. After an explicit user confirmation screen, call `POST /api/v1/transactions/circle-transfer` with the same values and a newly generated `Idempotency-Key` UUID. Store that UUID until the request has a final response; retrying with it returns the original transaction rather than starting another transfer.
6. Poll `GET /api/v1/transactions/circle/<circleTransactionId>` until the returned state is `COMPLETE` and a hash is present. Do not display a successful payment before then.
7. Render `GET /api/v1/transactions/<transactionId>/receipt` as the final payment receipt.

The recipient route returns only display name, wallet address, chain, and asset. It intentionally does not return phone numbers, Firebase IDs, or KYC information.

## 4. Phase 1 safety boundary

This build is intentionally prototype-only. It starts only with `PAYMENT_MODE=sandbox`, `RAZORPAY_MODE=test`, and `SANDBOX_BLOCKCHAIN=MATIC-AMOY`; `NODE_ENV=production` is rejected. Do not switch keys or environment values to attempt a real-money launch. Production requirements—ledger, compliance, provider reconciliation, and live settlement controls—belong to later phases.
