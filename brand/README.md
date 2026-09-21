# Intra production brand system

Start with [`BRAND-GUIDELINES.md`](BRAND-GUIDELINES.md) for human guidance or
[`brand.json`](brand.json) for machine-readable identity data.

## Directory map

```text
brand/
  brand.json                 Machine-readable identity manifest
  brand.schema.json          Manifest validation shape
  BRAND-GUIDELINES.md        Human-readable usage guide
  identity/                  Mark geometry reference
  logo/                      Canonical mark and derived exports
  colors/                    Color reference board
  typography/                Type reference board
  wordmark/                  Current wordmark status
  icons/                     Lucide usage guide
  illustrations/             Illustration gap record
  fonts-reference/           Implemented font stacks; no font binaries
  social/                    Platform exports, four masters, and safe-area guides
  templates/                 Social, presentation, screenshot, and diagram sources
  previews/                  Contact sheets for rapid visual review
  exports/                   Export policy and delivery index
  screenshots/               Screenshot safety and gap record
  docs/                      Inventory, copy, missing, and deprecated reports
  scripts/build-assets.mjs   Reproducible derivative builder
```

Run `node brand/scripts/build-assets.mjs` from the repository root to rebuild
the complete package. The build is deterministic, reads no network resources,
and does not modify application code or production assets.

## Start here

- `social/SOCIAL-BRAND-SYSTEM.md` — composition, platform, copy, and export rules.
- `social/README.md` — exact platform dimensions and upload-ready files.
- `templates/README.md` — editable template families.
- `docs/SOCIAL-ASSET-GAPS.md` — completion status and honest source gaps.
- `docs/DIRECTORY-TREE.md` — exact package file tree.
- `previews/` — visual contact sheets.

SVG files are editable masters. Paired PNG files are raster exports. Files with
bracketed text are templates and must be edited before publishing.

## Authority order

1. `src/components/brand/Mark.tsx` — regular mark geometry.
2. `src/app/icon.svg` — heavier favicon geometry.
3. `src/styles/tokens.css` — implemented color and typography tokens.
4. `src/lib/site.ts` — product name, tagline, and metadata descriptions.
5. ADR-022 in `docs/DECISIONS.md` — accepted visual direction.

Historical design references and frontend-xray recommendations are supporting
evidence, not higher-priority identity sources.
