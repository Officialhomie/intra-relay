# Missing-assets report

## Missing entirely

- The proposed eight-piece trust illustration set. Only briefs exist.
- A dedicated, approved vector wordmark and fixed logo lockup.
- Canonical product screenshots cleared of sensitive or fabricated data.
- Official third-party MiniPay, USDC, Celo, and WhatsApp brand assets.
- A multi-resolution `favicon.ico` fallback.
- The root URL `/icon-512.png` referenced by
  `scripts/register-erc8004-agent.mjs`; the real asset is currently served from
  `/icons/icon-512.png`.

## Exists in code and now has reusable exports

- The Handoff mark was primarily a React component and favicon SVG. It is now
  packaged as SVG, transparent PNG, reversed, monochrome, ivory, ink, favicon,
  and app-icon variants under `brand/logo/`.
- The runtime OG composition existed only in `next/og` code. A static SVG and
  PNG now live under `brand/social/`.
- Social profiles, platform covers, post ratios, presentation layouts,
  screenshot frames, and diagrams now have reusable SVG masters and PNG previews.
- Color, type, geometry, copy, and icon rules existed across source files. They
  are now centralized in `brand.json` and `BRAND-GUIDELINES.md`.

## Exists but needs cleanup

- Regular mark, favicon mark, PWA tile mark, and OG mark repeat geometry in
  separate code. Their intended optical differences are documented; shared
  constants would reduce accidental drift.
- Recurring agent-control copy appears in several modules with slight wording
  differences. It should only be centralized during a copy/API change, with
  tests updated together.
- Typography uses named tokens plus responsive and hardcoded utility sizes.
  This is internally workable but not a fully closed type scale.
- The current display stack requests weight 300; Georgia often renders it as a
  regular or synthetic light weight.

## Should not be created yet

- New logo concepts or a second mark.
- A vector wordmark based on outlined system font glyphs.
- Trust illustrations outside one coherent, reviewed eight-piece design pass.
- Stock or fabricated merchant photography, testimonials, avatars, prices, or
  transaction imagery.
- Crypto coins, chains, generic AI imagery, a mascot, decorative 3D graphics,
  or a dark-mode identity set.
- Unofficial redraws of partner logos.
- Further templates beyond the current ten content families until real social
  content reveals a repeatable need.
