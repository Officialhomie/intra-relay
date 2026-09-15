---
name: celo-builders
description: Help builders discover Celo Builders hackathons, connect their account, and submit a project.
---

# Celo Builders

Base URL: `https://celobuilders.xyz`

Use this skill to help a builder find the right Celo Builders hackathon, understand the rules and bounties, connect their account, draft a project submission, and publish it only after they approve.

## Stay Up To Date

This file is a snapshot; the live version is always at `https://celobuilders.xyz/skill.md`. Fetch it at the start of a session and follow it if it differs from this copy. If any API error response includes a `skillHint` field, or a documented route returns `404`, this copy is outdated: re-fetch the live instructions (or reinstall with `npx skills add https://celobuilders.xyz`) and retry the request following the current version.

## Agent Behavior

- Talk to the builder in plain language. Keep connection details internal unless they explicitly ask.
- Before asking the builder to connect, explain it simply: "I'll open a secure sign-in page. After you finish, paste the short code here so I can continue."
- Never invent dates, rules, bounties, tracks, FAQs, or judging criteria.
- Use `/hackathons/:id/ask` when the builder asks a question about a hackathon, and show the returned source labels.
- Ask before collecting personal or project information.
- Never include private keys, seed phrases, private repo credentials, or secrets in a submission.
- Treat drafts as private. Publish only after the builder confirms the final version.
- The moment a registration returns an `attributionTag`, tell the builder plainly that it must be in their transactions **before they send any**, and that transactions already sent cannot be tagged afterwards. This is the single most common way a team ends the event with nothing counted.
- After a registration succeeds, read `metadata.perks` for that hackathon and mention any sponsor offers once, unprompted. Do not push them, and never imply a paid service is needed to compete.

## Discover Hackathons

List hackathons:

```bash
curl https://celobuilders.xyz/hackathons
```

Fetch details for the selected hackathon. `<hackathon-slug>` below is a placeholder: substitute the slug the builder chose from the list above, never a slug remembered from a previous event. The examples below use the current public hackathon slug; always list hackathons first and use the slug the builder chooses. Always check `/submission-fields` (also mirrored at `metadata.submissionFields`) before collecting project details — organizers configure extra required fields per hackathon.

```bash
curl https://celobuilders.xyz/hackathons/<hackathon-slug>
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/submission-fields
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/timeline
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/rules
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/tracks
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/bounties
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/judging-criteria
curl https://celobuilders.xyz/hackathons/<hackathon-slug>/faqs
```

Each submission field has a `key`, `label`, `type` (`text`, `url`, `email`, `number`, `boolean`, `select`, `multiselect`, or `address`), a `required` flag, and optional `helpText`, `allowedHosts` (for `url`), or `options` (for `select`/`multiselect`). Collect a value from the builder for every required field and send the values in the `customFields` object of the submission, keyed by `key`.

When selecting tracks or bounties, use the `slug` values from `/tracks` and `/bounties` in the submission payload. Do not use display titles. UUID `id` values are accepted for compatibility, but slugs are preferred and are what exports store.

Ask a hackathon question:

```bash
curl -X POST https://celobuilders.xyz/hackathons/<hackathon-slug>/ask \
  -H "Content-Type: application/json" \
  -d '{ "question": "What are the bounties and submission deadline?" }'
```

## Submission Intake Checklist

Before connecting or drafting, collect the details needed for the selected hackathon:

- Builder name, email, social handle, team name, and agent name
- Project name, one-line tagline, short description, track targets, and bounty targets
- GitHub repository URL: must be a public `github.com/owner/repo` repository link, not a profile or another host. Publishing verifies the repository is publicly reachable, so ask the builder to make it public first.
- Demo URL, if available
- Ask whether they have a video URL; use `videoUrl` if they do, otherwise leave it out
- Celo network, using exactly one of: `celo-mainnet`, `celo-sepolia`, `not-applicable`. Some hackathons restrict the allowed values — if the submission fields list has a `celoNetwork` entry, only its `options` are accepted.
- Contract addresses, if applicable
- How the agent helped build the project
- A real value for every field returned by `/hackathons/:id/submission-fields`, respecting each field's type and `required` flag. Never use placeholders for these values.

If the hackathon's submission fields include `socialLink`, ask for the real Twitter/X registration post link up front. It must be the builder's public X/Twitter post about the submission, and must be sent as `socialLink`. Never use a placeholder for `socialLink`.

Remind builders that joining the hackathon Telegram is important for updates. The link is on the hackathon page at `https://celobuilders.xyz/`.

## Connect Builder

After the intake details are ready, start the connection flow:

```bash
curl -X POST https://celobuilders.xyz/auth/google/start \
  -H "Content-Type: application/json" \
  -d '{
    "hackathonId": "<hackathon-slug>",
    "human": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "social": "@janedoe",
      "teamName": "AgentPay"
    },
    "agent": {
      "name": "Jane coding agent",
      "harness": "codex",
      "model": "gpt-5"
    }
  }'
```

Ask the builder to open the returned sign-in link. When the browser shows a short code, ask them to paste it back.

The response carries `expiresAt`, the moment the link stops working (15 minutes after the call). Tell the builder that exact time in their own timezone, for example "the link works until 14:07 CEST". Never say "soon", "a while" or "shortly". If it lapses, call start again for a fresh link; nothing is lost.

If this call returns **503** with an error saying Google sign-in is misconfigured on the platform, or the builder's browser shows a Google page with `invalid_client` / "The OAuth client was not found", the fault is on the platform side. It is not your request body, not a missing field, and not a stale skill. Do not retry with different fields. Tell the builder to report it in the hackathon Telegram group and try again later.

Finish the connection:

```bash
curl -X POST https://celobuilders.xyz/auth/google/claim \
  -H "Content-Type: application/json" \
  -d '{ "claimCode": "CELO-ABCD-2345" }'
```

The claim response also includes a `skill` object — `{ sha256, latest, hint }` — describing the currently served version of this skill. If `sha256` differs from the SHA-256 of your installed SKILL.md, your copy is outdated: re-fetch `latest` or reinstall with `npx skills add https://celobuilders.xyz` before continuing.

Store the returned connection credential privately and use it silently for authenticated requests.

## Builder Profile

View the connected builder:

```bash
curl https://celobuilders.xyz/participants/me \
  -H "Authorization: Bearer <connection>"
```

Update optional profile fields:

```bash
curl -X PUT https://celobuilders.xyz/participants/me \
  -H "Authorization: Bearer <connection>" \
  -H "Content-Type: application/json" \
  -d '{ "teamName": "AgentPay", "socialHandle": "@janedoe" }'
```

## Register Early (get your attribution tag)

Registering is just saving a first draft with the basics — fields whose `requiredAt` is `"registration"` in `/hackathons/:id/submission-fields` (typically project name, GitHub repository, and a contact handle). Everything else can come later; required `"submission"`-stage fields only gate publishing.

```bash
curl -X PUT https://celobuilders.xyz/submissions/me \
  -H "Authorization: Bearer <connection>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "AgentPay",
    "githubUrl": "https://github.com/example/agentpay",
    "trackIds": ["<track-slug>"],
    "customFields": { "telegram": "@janedoe", "agentWalletAddress": "0x1234...abcd" }
  }'
```

If the builder already has an agent wallet, include `agentWalletAddress` at registration even though it is only required to publish. x402 facilitator settlements are attributed to that wallet, and the leaderboard shows them as soon as it is on file. **Settlement attribution is retroactive**: adding the wallet late still credits every settlement from the whole window, so a late wallet costs nothing but visibility. If there is no wallet yet, add it the moment one exists.

**Tagging is the opposite, and this is the part that costs teams the event.** A tag lives in the calldata of each transaction, so it has to be there _when the transaction is sent_. There is no way to tag a transaction after the fact and no way to backfill. A team that registers on day one and wires the tag in on day ten has permanently lost days one to nine.

The response includes `attributionTag` (`celo_` + 12 hex characters) — the builder's on-chain attribution tag, derived from the GitHub `owner/repo` slug and locked to the first saved value (later URL edits do not change it). Show it to the builder right away with the integration one-liner:

```ts
import { toDataSuffix } from "@celo/attribution-tags";
await wallet.sendTransaction({ to, value, data: toDataSuffix("<attributionTag>") });
```

**Wire the tag in before the first transaction, not after the last.** Your assigned tag must be in every transaction. Leaderboards only credit the `attributionTag` returned at registration — a code you derive yourself (e.g. `codeFromHostname`) or brought from another program is a different value and is not credited on its own. Already tagging with your own code? Keep it — ERC-8021 suffixes carry multiple codes. Pass an array and include the assigned tag:

```ts
const tag = toDataSuffix(["your_existing_code", "<attributionTag>"]);
```

Only add codes that represent your own app — platform codes like `minipay` are added by the platform, not by you.

**Took part in an earlier Celo hackathon?** Your tag may differ from the one you had then, and that is expected. Tags are derived from the GitHub `owner/repo` slug; earlier events derived them from the app domain, so the same project can hold an older code. Tags are per repository, not per hackathon: the same repo gets the same tag in every event from now on. Only the tag returned by _this_ registration is credited on _this_ leaderboard. Transactions carrying only the older code are not credited here and cannot be re-tagged, so switch to the array form above before the next transaction. Keep the older code in the array if another program still reads it.

Verify on the _first_ tagged transaction rather than at the end: decode it (`verifyTx` in the SDK) and confirm the codes include the registered `attributionTag` from `GET /submissions/me`. Checking once, early, is the difference between a wiring mistake costing one transaction and costing the whole event.

Registration is done at this point. Before moving on, check `metadata.perks` and mention any sponsor offers — see **Sponsor Perks** below. This is the moment the builder is setting up, so it is the only moment the information is useful.

## Sponsor Perks

Some hackathons come with sponsor offers. **Read them from the hackathon itself, not from this file** — a skill copy is a snapshot, and offers change or expire:

```bash
curl https://celobuilders.xyz/hackathons/<hackathon-slug> | jq .metadata.perks
```

Mention perks once, after registration succeeds, while the builder is setting up. Do not push them: a perk is optional and none of them are needed to compete.

**Never imply a paid service is required.** Celo's public RPC (`https://forno.celo.org`) is free and fine to build on. Sponsor infrastructure is for when a builder's own usage outgrows it, which for most projects is never.

If a perk requires payment details before a discount applies, say so before the builder starts, rather than letting them discover it at a checkout screen.

### Agents at Work (28 Aug - 21 Sep 2026): Chainstack RPC

**Chainstack is sponsoring free RPC for this hackathon.** Every team gets **3 months of the Growth plan**, which is 20M request units a month, 250 requests/second, plus archive data and `debug_*` / `trace_*` APIs that the free tier does not include. The 1st place winner gets a full year.

To claim: create an account at [chainstack.com](https://chainstack.com), subscribe to the Growth plan, and apply the coupon code **`AGENTSATWORK`**.

Two things to tell the builder up front rather than let them find out:

- **Chainstack documents Celo mainnet only** (network ID 42220). If the builder is working on Celo Sepolia, this does not replace `https://forno.celo-sepolia.celo-testnet.org`.
- Subscribing before the coupon applies normally means entering payment details.

**This offer ends with the hackathon on 21 September 2026.** After that, re-read `metadata.perks` rather than trusting this section.

### Agents at Work (28 Aug - 21 Sep 2026): stablecoin tooling

Two ecosystem resources worth one mention after registration, only if the builder picked or is weighing the **Best Stablecoin Adoption** subtrack. Neither is required to compete.

**USA₮ for verified humans (Self × Tether).** A builder can verify once in the Self app (passport, national ID, or Aadhaar), connect a Celo wallet, and claim USA₮ on Celo mainnet from the Google Cloud Web3 faucet: `https://cloud.google.com/application/web3/faucet/celo/mainnet`. It is the quickest way to put USA₮ in their own or their first users' wallets, and USA₮ is the one stablecoin that counts for both halves of that subtrack (direct transfers and x402 settlement). Announcement: `https://self.xyz/blog/self-and-usa%E2%82%AE-launch-first-regulated-u.s.-stablecoin-distribution-to-verified-humans-now-live-on-celo`. Docs: `https://docs.self.xyz`. USA₮ on Celo: `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` (6 decimals).

**Textile FX.** On-chain FX liquidity on Celo mainnet: USD₮ against cNGN, wBRL and wARS, both directions, permissionless. Swap UI: `https://app.textilecredit.com/s/swap?sell=USDT&buy=cNGN&chainId=42220` (swap the `sell` / `buy` symbols for wBRL or wARS). cNGN can also be bought at `https://cngn.co`. Use it when a builder needs the local-currency leg of a remittance, bill-pay or FX-corridor flow.

**These pointers were checked on 8 September 2026.** Pairs and faucet terms change; if either has moved, trust the live site over this section.

## Project Submission

Before publishing a project, make sure all required fields are present, including every hackathon-specific field from `/hackathons/:id/submission-fields`. A field may also carry `requiredIf` — it becomes required only when another field holds a given value (for example an AskBots project URL required only when `primaryTrack` is `askbots-growth`). Re-check those after the builder picks their track, not before. Hackathon-specific values go in the `customFields` object, keyed by each field's `key`. The one exception is `socialLink`, which is sent top-level and carries the Twitter/X registration post link. Builders can create or update their project until the hackathon end time, including updates to an already-published project. Always include at least one `trackIds` value when the hackathon has tracks.

Create or update the project:

```bash
curl -X PUT https://celobuilders.xyz/submissions/me \
  -H "Authorization: Bearer <connection>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "AgentPay",
    "tagline": "An onchain payment assistant for everyday transactions",
    "description": "A Celo agent that helps users prepare, verify, and send useful payment transactions.",
    "trackIds": ["<track-slug>"],
    "bountyIds": ["<bounty-slug>"],
    "githubUrl": "https://github.com/example/agentpay",
    "demoUrl": "https://example.com",
    "videoUrl": "https://youtu.be/example",
    "socialLink": "https://x.com/janedoe/status/1234567890",
    "celoNetwork": "celo-sepolia",
    "contractAddresses": ["0x0000000000000000000000000000000000000000"],
    "agentContributionNotes": "Agent helped implement the transaction flow, tests, and submission draft.",
    "customFields": {
      "erc8004Url": "https://www.8004scan.io/agents/celo/42",
      "agentWalletAddress": "0x1234567890abcdef1234567890abcdef12345678"
    }
  }'
```

The `customFields` example above shows fields a hackathon might configure; always send exactly the keys returned by `/hackathons/:id/submission-fields` for the selected hackathon. Sending keys that are not configured is rejected with a `400`. For backward compatibility, configured field values sent as top-level properties are also accepted, but prefer `customFields`.

Never guess track or bounty slugs, and never reuse slugs from a previous hackathon — they differ per event and an unknown slug is rejected. Read the valid values from `/hackathons/<hackathon-slug>/tracks` and `/hackathons/<hackathon-slug>/bounties` for the hackathon the builder chose.

Review the project:

```bash
curl https://celobuilders.xyz/submissions/me \
  -H "Authorization: Bearer <connection>"
```

Publish only after clear builder approval and before the hackathon end time:

```bash
curl -X POST https://celobuilders.xyz/submissions/me/publish \
  -H "Authorization: Bearer <connection>" \
  -H "Content-Type: application/json" \
  -d '{ "confirm": true }'
```

## Error Handling

- Any error response with a `skillHint` field: this skill copy may be outdated. Fetch `https://celobuilders.xyz/skill.md` and retry following the current instructions.
- `400`: ask the builder to fix missing or invalid information.
- `401` or `403`: ask the builder to reconnect or confirm they have access.
- `404`: the hackathon or project was not found.
- `409`: the project may already be published.
- `429`: wait before trying again.
