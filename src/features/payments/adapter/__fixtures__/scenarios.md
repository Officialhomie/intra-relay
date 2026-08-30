# Payment adapter test fixtures

Four scenarios, exercised by `src/features/payments/adapter/x402.test.ts` and
`src/app/v1/v1.payment.contract.test.ts`.

| Scenario                             | Adapter / facilitator                                                          | Expected result                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unavailable**                      | `NoopPaymentAdapter` (no `X402_API_KEY`)                                       | `settle()` → `UNAVAILABLE`; the quote endpoint returns `503 PAYMENT_SERVICE_UNAVAILABLE`; a `service_payments` row is recorded as `UNAVAILABLE`; audit `payment.unavailable`.                                                               |
| **Failed verification**              | `X402PaymentAdapter` + facilitator `/verify` → `verify-invalid.json`           | `settle()` → `FAILED` code `VERIFICATION_FAILED`; `/settle` is never called; endpoint returns `402 PAYMENT_FAILED`; immutable `service_payments` row `FAILED`; audit `payment.failed`; **no task, no tx hash**.                             |
| **Valid verified receipt**           | facilitator `/verify` → `verify-valid.json`, `/settle` → `settle-success.json` | `settle()` → `SETTLED` with the real `txHash`, `explorerUrl` on `celoscan.io`; endpoint returns `200` + `X-PAYMENT-RESPONSE`; immutable `service_payments` row `SETTLED`; audit `payment.settled` (no auth payload); task `AWAITING_QUOTE`. |
| **Duplicate callback / idempotency** | same `X-PAYMENT` presented twice                                               | identical `authorizationKey`; the second call replays the first receipt and task; `/verify` + `/settle` are **not** called again; exactly one `service_payments` row.                                                                       |

`verification` on a stored receipt contains only the facilitator's verify/settle
result summary — never a signature or the EIP-3009 authorisation struct.
