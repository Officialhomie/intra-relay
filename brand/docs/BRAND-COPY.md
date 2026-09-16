# Brand copy audit

This is an extraction, not a rewrite. “Canonical” means a repeated product
promise or a value in the central metadata source. “One-off” means correct copy
for one screen. “Inconsistent” means multiple wordings currently describe the
same role or promise.

## Canonical copy

| Role             | Current language                                                         | Source                  |
| ---------------- | ------------------------------------------------------------------------ | ----------------------- |
| Product name     | “Intra”                                                                  | `src/lib/site.ts`       |
| Tagline          | “The trusted business layer for AI-agent commerce”                       | `src/lib/site.ts`       |
| Social headline  | “Tell Intra what you need. Get a real price. Keep the final say.”        | Runtime OG image        |
| Trust statement  | “Real businesses. Clear quotes. You stay in control.”                    | Footer                  |
| Buyer promise    | “You get a fresh quote, keep the final say…”                             | Landing page            |
| Agent boundary   | “I never send an order or pay for you.”                                  | Conversation UI/replies |
| Handoff title    | “Order handoff — you send this yourself”                                 | Task page               |
| Supplier promise | “You review each request and keep the customer relationship direct.”     | Landing page            |
| Safety line      | “No wallets, no private keys, and no final order without your approval.” | Landing page            |

## One-off copy

| Context              | Language                                  | Why it remains contextual                   |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| Buyer CTA            | “I need something made”                   | Starts the buyer workflow                   |
| Business CTA         | “I run a business” / “Set up my business” | Separates supplier intent from buyer intent |
| Header CTA           | “Join as a business”                      | Compact global navigation action            |
| WhatsApp action      | “Open in WhatsApp”                        | Names the external destination              |
| Handoff confirmation | “I’ve sent this to the printer”           | Records a specific human action             |
| Quote request        | “Get a real response”                     | Explains asynchronous supplier review       |
| Empty agent state    | “Tell me what you need…”                  | Conversational entry point                  |

## Inconsistent or duplicated copy

1. The central tagline says “AI-agent commerce”; the landing eyebrow says “AI
   commerce.” Both are valid, but the former is the metadata authority.
2. The conversation entry promise exists in at least three variants across the
   UI, API reset response, and informational reply. All preserve the same human
   approval boundary, but future copy editing should update them together.
3. “Supplier,” “printer,” and “business” are used deliberately by context, but
   can appear interchangeable. Public/general copy prefers “business”; the live
   printing workflow may say “printer”; internal data/API language uses
   “supplier.”
4. “Human-approved WhatsApp handoff,” “you send the order yourself,” and “Open
   in WhatsApp” describe different stages and should not be flattened into one
   phrase.
5. “Real price,” “fresh quote,” and “genuine quote” are related but carry
   different precision. A quote is a business response; “fresh” additionally
   depends on route and quote validity.

## Required terminology boundaries

- Say **query fee** or **agent service payment** for x402. Never imply it is the
  customer’s order payment.
- Say **order payment** only for the buyer-approved payment intent derived from
  accepted commercial terms.
- Say **handover attestation** for evidence that named parties completed the
  protocol. Do not say it proves quality, quantity, timeliness, or satisfaction.
- Say **verified business** only where operator verification actually exists.
- Say **demo** visibly for synthetic seed data.
- Say **unavailable** when credentials, access, or verification are absent.

## Language not to use

- “Guaranteed price,” “guaranteed supplier,” or “guaranteed outcome.”
- “Intra sends your order” or “Intra pays for you.”
- “Escrow,” “custody,” or “wallet held by Intra.”
- “Verified payment” before server-side chain verification succeeds.
- “On-chain proof of quality.”
- “Live integration” for Celo/x402/cPay features that are unavailable in the
  running environment.
- Fabricated customer, merchant, price, transaction, or testimonial claims.
