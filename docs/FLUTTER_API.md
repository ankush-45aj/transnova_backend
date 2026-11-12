# Phase 1 Flutter API contract

Every protected endpoint requires `Authorization: Bearer <Firebase ID token>`. All value-creating requests require a fresh UUID in `Idempotency-Key`; keep and reuse that same key only when retrying the same request after a timeout.

## User and wallet

`POST /api/v1/auth/sync`

```json
{ "displayName": "User A" }
```

The response contains the stable Circle sandbox wallet and QR data. Call this after Firebase sign-in, then use `GET /api/v1/wallets/me` to refresh it. Phase 1 accepts only `MATIC-AMOY` test wallets.

To resolve a recipient without exposing private profile fields:

`GET /api/v1/users/recipient?email=user-b@example.com`

```json
{
  "recipient": {
    "displayName": "User B",
    "walletAddress": "0x...",
    "blockchain": "MATIC-AMOY",
    "asset": "USDC"
  }
}
```

## Test USDC transfer

First show a confirmation screen using the returned fee estimate:

`POST /api/v1/transactions/estimate-fee`

```json
{ "walletId": "<user-a-wallet-id>", "destinationAddress": "0x...", "amount": 5 }
```

On confirmation:

`POST /api/v1/transactions/circle-transfer`

Headers: `Idempotency-Key: <new UUID>`

```json
{ "walletId": "<user-a-wallet-id>", "destinationAddress": "0x...", "amount": 5 }
```

The response is an initiated transaction, not a successful payment. Poll every 3–5 seconds:

`GET /api/v1/transactions/circle/<circleTransactionId>`

Only treat it as successful when `state` is `COMPLETE`, `transaction.status` is `completed`, and `txHash` is non-empty. Then show:

`GET /api/v1/transactions/<transactionId>/receipt`

## Razorpay test payment

`POST /api/v1/razorpay/create-order`

Headers: `Idempotency-Key: <new UUID>`

```json
{ "amount": 10.5 }
```

Pass the response `checkout` values to the Razorpay Flutter Checkout SDK. Its `amount` is paise, not INR. After the Flutter SDK success callback, send its three values to:

`POST /api/v1/razorpay/verify-payment`

```json
{
  "razorpay_order_id": "order_test_...",
  "razorpay_payment_id": "pay_test_...",
  "razorpay_signature": "..."
}
```

The backend checks the client signature and fetches the provider payment. Your webhook remains the authoritative final capture signal. Poll `GET /api/v1/razorpay/payment/<orderId>` until `payment.status` is `captured` or `failed`, then show the compact receipt from `GET /api/v1/razorpay/payment/<orderId>/receipt`.

Razorpay Phase 1 is a domestic merchant collection demonstration only: User A pays the TransNova test merchant account. It does not pay User B and does not trigger a crypto transfer.
