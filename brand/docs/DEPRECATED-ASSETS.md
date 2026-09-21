# Deprecated and conflicting identity references

Nothing was deleted. Historical sources remain where they were found.

## Superseded palette

ADR-009’s forest system is deprecated by ADR-022:

- Forest Ink `#0f3e17`
- Linen White `#fffefc`
- Sage Wash `#b1dbb8`
- Mist Blue `#b6ced5`
- Mint Veil `#cfe7d3`
- Linen Green `#e1f4df`

These values remain throughout `docs/design/` because those files describe
external visual references and historical decisions. They are not runtime
tokens and should not be copied into new Intra assets.

## Stale audit statements

`docs/frontend-xray/11-ASSET-INVENTORY.md` accurately described the repository
before commit `281acd4`, but its opening inventory is now stale. Since that
audit, Intra gained:

- `src/components/brand/Mark.tsx`
- `src/app/icon.svg`
- regenerated ink/ivory PWA icons
- an ink/ivory Open Graph composition
- current theme/background colors in the manifest and layout metadata

The document remains valuable historical evidence and was not overwritten.

## Conflicting geometry implementations

The same concept is encoded three ways:

1. Regular in-app mark: radius 4.5, stroke 2.2, 32-unit view box.
2. Favicon optical-size mark: radius 4.8, stroke 2.6, 32-unit view box.
3. PWA tile generator: proportional 512-unit geometry based on padding.

The first two are intentional optical sizes. The third matches the concept and
colors but is not mathematically identical. Treat `Mark.tsx` as the regular
geometry authority and `icon.svg` as the favicon authority. A future tooling
cleanup can import shared constants into the PWA generator.

## Former placeholder mark

The pre-identity header used a filled circle with a serif “I”. It no longer
exists in the current source and is visible only in Git history and the older
frontend xray. Do not restore or export it.

## Unrelated design references

`docs/design/DESIGN (4–8).md` describes Sequel, Ease, Hyperstudio, Aaru, and
other reference systems. Their logos, colors, and typefaces are not Intra
assets. They should stay clearly labeled as research.
