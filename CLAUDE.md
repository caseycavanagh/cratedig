@AGENTS.md

# Cratedig

Casey's record crate: every record Casey owns, flipped through like a crate. It moved here from caseycavanagh/caseycavanaghdotcom on 2026-10-29, history included.

## Where things are

- For now (2026-11-07) `/` and `/casey` redirect to `/casey/all` (next.config.ts redirects); the landing page and crates page below are kept but not shown.

- `public/landing.html`: the front door, served at `/` through `src/app/landing`. The sentence and a search box that hands off to the make page (`/vinyl-make.html?q=…`), with one of Casey's crates beside it as the example (the pinned one, else the whole crate; filled in by the route). Old `/?r=`, `?edit` links redirect to `/casey` (next.config.ts), old `/#record/…` links are forwarded by the page.
- `public/crates.html`: Casey's crates, served at `/casey` through `src/app/crates` (which puts in the crates from `crateTiles` in `src/lib/record.ts`). A pinned crate, or the only one, leads big; the rest sit equal, with the words Casey wrote for each. Old `/casey?r=`, `?edit` and `#record/…` links go to `/casey/all`.
- `public/index.html`: one crate (the "after Cosmos" direction), served at `/casey/<crate>` through `src/app/home`; `/casey/all` is the whole crate. One self-contained file: its own `const RECORDS=[ … ].map(` list, styles and scripts; it reads which crate from its address and uses absolute paths (`/vinyl/…`) for that reason.
- `public/vinyl-prototype.html`: the original crate. The sticker sheets and `scripts/vinyl-covers.mjs` read RECORDS from it by that `const RECORDS=[ … ].map(` line, so keep its shape, and keep its list in step with index.html.
- `public/vinyl-*-sheet.html`, `public/vinyl-dial.html`: sticker sheets for comparing options (star to pick, picks stay in the browser).
- `public/vinyl-make.html` + `public/vinyl/visitor-crate.js`: anyone can make a crate and share it as a link. Records come from `/api/discogs` (DISCOGS_TOKEN), else `/api/musicbrainz`, else Apple Music.
- `public/vinyl/tokens.css`: the design tokens every page links (landing, crate, make page): colors, the six type sizes, corners, three shadows, easing, layers, and the breakpoints in use. Add to it rather than typing a value into a page.
- `public/vinyl/`: covers (1200px WebP, `<slug>-front.webp` / `-back.webp`), `covers.json` (years, labels, links, spine colors), the mark (`records-logo.svg`, `records-icon.svg`), divider pictures in `dv/`.
- Icons: `npm run icons` (`scripts/icons.mjs`) draws `public/favicon.svg`, `favicon.ico` and `apple-touch-icon.png` from the mark. Link previews are `src/lib/og.tsx`, served at `/og` (Casey's crate), `/og/landing` and `/og/make`; `/`, `/casey` and the make page go through `src/lib/page.ts`, which puts the domain each request came in on in front of og:url and og:image (and the card's footer), so any domain the site answers on previews itself. Options in `public/vinyl-icon-sheet.html`.
- `scripts/vinyl-covers.mjs` (`npm run vinyl-covers`): fetches covers and facts for new records. Run it on Casey's Mac; cloud machines can't reach MusicBrainz or Apple.
- Edit mode (Casey only): a device signs in once from About (or `?edit`), then Edit sits beside the crate's name; while editing, the bottom bar becomes the tools and Details opens a sheet with every field, liner notes included (`notes` in a record's patch, laid over `/api/liner`). Server side: `src/app/api/crate/*` and `src/lib/crate.ts`. Edits live in Upstash Redis (`src/lib/kv.ts`) under `crate:edits` (the other crates too, under `crates`: each picked from the whole crate by slug, plus records only it holds), uploaded covers under `crate:img:<id>`, served from `/api/crate/img/<id>`. Keep those paths: saved edits point at them.

## Settings

Env vars (never print them): CRATE_KEY, KV_REST_API_URL and KV_REST_API_TOKEN (the same Upstash database as caseycavanagh.com's likes), SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (Play links for visitor crates), DISCOGS_TOKEN (optional), ANTHROPIC_API_KEY (writes each record's About from its Wikipedia article in `src/lib/about.ts`; without it the page shows the article's Background paragraph).

## Design

- Always dark. The system font for text (`--sans`: system-ui), Geist Mono (`--mono`) for what you scrub through to find your place: the dial's letters and years, the letter rail and its bubble. Tabular figures.
- Six type sizes (`--fs-1` to `--fs-6`: 12, 13, 15, 17, 26, 34); headings at 500. Inputs on a phone stay at 17 so iOS doesn't zoom. Corners nest: panels 20, anything inside a panel 14, covers 2, pills round. Link previews (`src/lib/og.tsx`) still draw in Instrument Sans, since they render on a server with no system font.
- Motion is calm: springs without overshoot, quick fades out. Respect reduced motion.
- A quiet interface: no instructions, no counts or "n of n" on the dial.
- Voice: plain, warm, short, sentence case, US English.
