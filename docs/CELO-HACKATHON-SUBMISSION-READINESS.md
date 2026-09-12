# Celo "Agents at Work" hackathon — submission readiness audit

Investigation date: 2026-09-11. Deadline: **Monday, September 21, 09:00 GMT**
(10 days out). Source: official hackathon page (celoplatform.notion.site,
linked from the pinned [@CeloDevs](https://x.com/CeloDevs) post) + this repo's
current state (`git`, `gh`, `vercel`, `docs/DECISIONS.md`, `.env.local`).

Primary track per `CLAUDE.md` §1: **Real World Adoption** (Track 2), secondary
**Best Stablecoin Adoption** (Track 2 subtrack). AskBots CLI Growth (Track 3)
and Judges' Favorite (Track 4) are named as opportunistic secondary tracks.

---

## TL;DR — three blockers, in order

1. **The GitHub repo is private.** `gh repo view Officialhomie/intra-relay`
   returns `"isPrivate": true`. The rules: _"Public GitHub repo. It must still
   resolve at judging, or your entry is ineligible."_ This alone disqualifies
   the project as it stands.
2. **Not registered for the hackathon.** No `celobuilders` registration has
   happened — there is no ERC-8004 Agent ID, no ERC-8021 attribution tag, and
   no agent wallet on file anywhere in the repo or `.env.local`. Every
   track's leaderboard counts **only** transactions carrying the assigned tag,
   and the tag **cannot be backfilled** once a transaction is sent.
3. **The attribution tag is not wired into the MiniPay payment path.** Even
   after registering, `src/features/payments/minipay/wallet-adapter.ts:96-100`
   builds the ERC-20 `transfer` calldata with plain `encodeFunctionData` and
   sends it as-is — no `toDataSuffix` call. The one live MiniPay transaction
   ADR-023 has pending (`docs/DECISIONS.md` ADR-023) would be **permanently
   uncounted** if sent before this is fixed.

Everything else — the product itself, the commit history, the live deployment
— is in genuinely good shape. This is a sequencing problem, not a rebuild.

---

## What's already right

| Check                                                   | Status             | Evidence                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commits span the whole window, not a final-weekend push | ✅                 | `git log`: first commit 2026-08-29 (day after kickoff), commits on 8 of the 14 days since, most recent 2026-09-11. Rules explicitly reward this pattern and penalize sandbagging.                                                                                    |
| Celo mainnet only, no testnet dependency in the product | ✅                 | ADR-018/ADR-023 both state mainnet-only; `.env.example` warns ERC-8004 registries have no code on Celo Sepolia.                                                                                                                                                      |
| Real distribution channel already owned                 | ✅                 | MiniPay (Opera's non-custodial Celo wallet) — exactly the kind of channel the rules call out ("anything with a distribution channel you already own, e.g. MiniPay, Telegram, or WhatsApp").                                                                          |
| One narrow concrete job, not a general-purpose agent    | ✅                 | Flyer-printing quote → human-approved order → MiniPay settlement. Rules: _"No project built around a general-purpose agent placed in the top tier."_                                                                                                                 |
| Sponsored-gas / EIP-3009 users still counted            | N/A, informational | Rules count sponsored-relay signers and authorisers, not just gas payers — relevant if a gasless flow is added later; nothing to fix now.                                                                                                                            |
| Live production deployment                              | ✅                 | `vercel ls` shows multiple `Ready` Production deployments on `intra-relay`, most recent 5h old.                                                                                                                                                                      |
| No fabricated payment/settlement data                   | ✅                 | CLAUDE.md §4.1 is enforced in code — `verifyOrderPayment` only reaches `CONFIRMED` off a real Celo receipt (ADR-023); this is exactly the rules' anti-farming bar.                                                                                                   |
| x402 adapter already has attribution-tag plumbing       | ✅ (partial)       | `src/features/payments/adapter/config.ts` already validates and records `X402_ATTRIBUTION_TAG` (ERC-8021 format) on the x402 agent-query-fee path — just needs the real value once issued. This does **not** cover the MiniPay direct-transfer path (see blocker 3). |

---

## The three blockers, in detail

### 1. Repo visibility

```
$ gh repo view Officialhomie/intra-relay --json isPrivate,visibility
{"isPrivate": true, "visibility": "PRIVATE"}
```

Rules, verbatim: _"Public GitHub repo. It must still resolve at judging, or
your entry is ineligible."_ Also: _"last hackathon, two entries could not be
verified because their repos returned 404"_ — the judges have already been
burned by this exact failure mode once.

**This is a decision for you, not something to flip silently** — going public
exposes the full source (including anything currently relying on the repo
being private, e.g. any secrets accidentally committed). I did not check the
repo for committed secrets as part of this audit; that should happen **before**
flipping visibility, not after.

### 2. Hackathon registration

Nothing in `.env.local`, `.env.example`, or the codebase reflects a completed
`celobuilders` registration:

```
$ grep -E '^(ERC8004_IDENTITY|ERC8004_REPUTATION|X402_ATTRIBUTION_TAG|AGENT_WALLET)' .env.local
(no output — all unset)
```

Registration happens through an agent skill, not a web form:

```bash
npx skills add https://celobuilders.xyz
```

Then ask the installed skill to register the project. It will ask for:
project name, **public GitHub repo** (blocker 1 must be fixed first, or at
latest at the same time), Telegram handle, country, primary track (Real World
Adoption, per `CLAUDE.md`), ERC-8004 Agent ID, agent wallet(s), any
reviewer-agent wallet(s), and buy-beta opt-in (not relevant — Intra doesn't
target Track 5).

You get the ERC-8021 attribution tag (`celo_...`) back **instantly** on
registration. Two fields have different urgency:

- **Attribution tag and repo: needed before your first countable transaction.**
  The tag lives in transaction calldata — it cannot be added retroactively.
  Register **before** running the pending MiniPay live test in ADR-023, or
  that transaction is wasted for scoring purposes.
- **Agent wallet: safe to add later.** x402 settlements attribute to it
  retroactively across the whole window.

This step requires running an installer from an external, third-party URL and
handing it your project/GitHub/Telegram/wallet details — I'm not going to run
`npx skills add` or complete the registration on your behalf without you
confirming you want that installed and are ready to submit those details.

### 3. Attribution tag not wired into the MiniPay transfer

`src/features/payments/minipay/wallet-adapter.ts:96-109`:

```ts
const data = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [getAddress(input.recipientAddress), BigInt(input.amountAtomic)],
});
// ...
const txHash = await wallet.sendTransaction({
  account,
  chain: celo,
  to: getAddress(input.assetAddress),
  data,
  value: 0n,
});
```

No `toDataSuffix` call — the calldata is exactly the ERC-20 `transfer`
selector + args, nothing appended. Per the hackathon FAQ, Attribution Tags are
"built on ERC-8021 and shipped as a free, open-source SDK
(`@celo/attribution-tags` on npm), added with one line of code" that appends a
suffix to calldata without changing what the transaction does.

The x402 facilitator path (`src/features/payments/adapter/config.ts`,
`report.ts`) already threads `X402_ATTRIBUTION_TAG` through — that plumbing
only needs the real tag value once issued. The MiniPay direct-transfer path is
separate code and currently has **no** tag-wiring at all.

**Fix, once the tag is issued:**

1. `npm install @celo/attribution-tags` (new dependency — flagging per
   `CLAUDE.md` §6.2's change-control convention rather than adding silently;
   this one is hackathon-mandated and low-risk, unlike a chain/payment SDK
   chosen at our own discretion).
2. In `wallet-adapter.ts`, wrap the `data` passed to `sendTransaction` with
   `toDataSuffix([attributionTag])` (or `toDataSuffix(['your_code', tag])` if
   Intra ever adds its own code — not currently the case).
3. **Verify the very first transaction** by decoding it with `verifyTx` (per
   the rules) before treating the pilot test as done. This is a one-time check
   that catches a wiring mistake before it costs the whole event instead of
   one transaction.
4. Redeploy before Victor's phone + funded wallet + real SME pilot test
   (ADR-023's pending live-test runbook in `docs/PAYMENTS.md`) — that pending
   transaction is the one this whole chain of fixes needs to happen before.

---

## Recommended sequencing (10 days to Sept 21, 09:00 GMT)

1. **Today:** Decide on repo visibility (scan for secrets first, then flip to
   public) — this also unblocks registration, which requires a public repo.
2. **Today:** Run `npx skills add https://celobuilders.xyz` and register —
   get the ERC-8004 Agent ID and ERC-8021 tag. Do this _before_ any further
   real MiniPay/x402 transactions.
3. **This week:** Wire the tag into `wallet-adapter.ts` (blocker 3) and set
   `X402_ATTRIBUTION_TAG` in the real deployment env for the x402 path.
   Decode the first transaction with `verifyTx` to confirm the tag lands in
   calldata.
4. **This week:** Run the ADR-023 pending live MiniPay transaction (Victor's
   phone, funded wallet, real SME) now that it will actually count.
5. **Before Sept 19–20:** If pursuing Track 3 (AskBots), register on
   `askbots.ai` and get the baseline review round done — the second round has
   to happen that weekend and there's no extension on this track.
6. **By Sept 21, 09:00 GMT:** Submit through the `celobuilders` skill —
   description, demo, X post (quote-tweeting @CeloDevs, tagging @Celo,
   including the ERC-8004 registry link), and the agent/payTo wallet(s) so
   signers/authorisers are counted for Track 2.

## Open questions for you

- Confirm you want me to proceed with (a) checking the repo for secrets before
  making it public, and (b) actually flipping visibility once clear.
- Confirm you (not me) will run the `celobuilders` skill registration, since
  it requires your Telegram handle, country, and wallet addresses — or tell me
  to walk you through it live.
- Decide whether Track 3 (AskBots) and Track 4 (Judges' Favorite) are worth
  the extra registration overhead given the 10-day window, or whether to focus
  entirely on Track 2.
