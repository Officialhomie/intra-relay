# Illustration status

No production illustration files exist in the repository.

The “8-piece trust illustration set” is a proposal in
`docs/frontend-xray/11-ASSET-INVENTORY.md` and
`docs/frontend-xray/14-LOVABLE-ASSET-PROMPTS.md`. It contains briefs for eight
future assets, but there are no approved drawings or exports to extract.

Until that work is commissioned and approved, use the existing Lucide-based UI
states. Do not generate substitute illustrations and label them canonical.

| ID  | Proposed filename                            | Intended meaning from source brief                                               | Proposed format/dimensions          | Recommended state             | Current code usage                              | Current status      |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------- |
| B1  | `intra-illustration-your-decision.svg`       | The buyer chooses; nothing has moved yet                                         | SVG, ~160px square, transparent/web | Buyer approval                | Approval UI uses Lucide/status components       | Missing; brief only |
| B2  | `intra-illustration-payment-confirmed.svg`   | Money reached the business and was verified                                      | SVG, ~160px square, transparent/web | Confirmed payment             | `PayPanel` uses `ShieldCheck`                   | Missing; brief only |
| B3  | `intra-illustration-order-handed-over.svg`   | Both sides confirmed the exchange                                                | SVG, ~160px square, transparent/web | Handover complete             | Handover and pickup panels use Lucide icons     | Missing; brief only |
| B4  | `intra-illustration-waiting-on-business.svg` | The request reached a person; waiting is expected                                | SVG, ~160px square, transparent/web | Awaiting quote                | Waiting views use clock/loader icons            | Missing; brief only |
| B5  | `intra-illustration-offline.svg`             | Connection paused; reconnect and continue                                        | SVG, ~160px square, transparent/web | Offline                       | Offline page/banner use `WifiOff`               | Missing; brief only |
| B6  | `intra-illustration-nothing-needs-you.svg`   | The buyer is caught up                                                           | SVG, ~160px square, transparent/web | Empty action center/work list | Empty states use `Inbox` or status icons        | Missing; brief only |
| B7  | `intra-illustration-business-setup.svg`      | A real shop becomes reachable by an assistant while the owner remains in control | SVG, ~160px square, transparent/web | Supplier onboarding           | Onboarding uses `CheckCircle2` and CSS surfaces | Missing; brief only |
| B8  | `intra-illustration-could-not-complete.svg`  | Work stopped and is explained calmly                                             | SVG, ~160px square, transparent/web | Error/exception               | Error and callout surfaces use Lucide icons     | Missing; brief only |

The proposed production style is two colors, flat geometric linework, no faces,
stock tropes, phones, coins, chains, robots, gradients, shadows, or text. This
is a design brief, not an approved illustration identity.
