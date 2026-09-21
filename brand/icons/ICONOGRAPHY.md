# Iconography usage guide

Intra uses `lucide-react` as one consistent outline family. Do not export or
vendor individual Lucide SVGs into the brand directory; import them from the
library so they remain tree-shaken and inherit the current version.

## Sizes and strokes

| Context                           | Size | Stroke                    |
| --------------------------------- | ---- | ------------------------- |
| External-link/detail indicator    | 12px | Library default           |
| Compact button or inline action   | 14px | Library default           |
| Standard field, status, or button | 16px | Library default           |
| Navigation and state anchor       | 20px | 2; active nav may use 2.5 |

All icons inherit `currentColor`. Decorative icons use `aria-hidden`. Pair
status icons with text; do not make color or icon shape the only carrier of
meaning.

## Common semantic choices in current code

- Verified/trust: `BadgeCheck`, `ShieldCheck`
- Information: `Info`
- Warning/problem: `AlertTriangle`, `AlertCircle`
- Success/completion: `Check`, `CheckCircle2`, `PackageCheck`
- Waiting: `Clock`, `Clock3`, `Loader2`, `CircleDashed`
- Paused/unavailable: `PauseCircle`, `CircleSlash`, `WifiOff`
- Messaging/handoff: `MessageCircle`, `MessageSquare`
- Payment: `Wallet`, `WalletCards`
- Business/supply: `Store`, `Inbox`
- Agent/workflow: `Bot`, `Route`, `Sparkles`
- Security/access: `Lock`, `LockKeyhole`, `KeyRound`

The Handoff mark is identity and must not replace arbitrary product icons.
