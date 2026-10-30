@AGENTS.md

# Cratedig

Casey's record crate: every record Casey owns, flipped through like a crate. It moved here from caseycavanagh/caseycavanaghdotcom on 2026-10-29, history included.

## Where things are

- `public/index.html`: the crate (the "after Cosmos" direction), served at `/`. One self-contained file: its own `const RECORDS=[ … ].map(` list, styles and scripts.
- `public/vinyl-prototype.html`: the original crate. The sticker sheets and `scripts/vinyl-covers.mjs` read RECORDS from it by that `const RECORDS=[ … ].map(` line, so keep its shape, and keep its list in step with index.html.
- `public/vinyl-*-sheet.html`, `public/vinyl-dial.html`: sticker sheets for comparing options (star to pick, picks stay in the browser).
- `public/vinyl-make.html` + `public/vinyl/visitor-crate.js`: anyone can make a crate and share it as a link. Records come from `/api/discogs` (DISCOGS_TOKEN), else `/api/musicbrainz`, else Apple Music.
- `public/vinyl/`: covers (1200px WebP, `<slug>-front.webp` / `-back.webp`), `covers.json` (years, labels, links, spine colors), the mark (`records-logo.svg`, `records-icon.svg`), divider pictures in `dv/`.
- Icons: `npm run icons` (`scripts/icons.mjs`) draws `public/favicon.svg`, `favicon.ico` and `apple-touch-icon.png` from the mark. Link previews are `src/lib/og.tsx`, served at `/og` and `/og/make`; `/` and the make page go through `src/lib/page.ts`, which puts the domain each request came in on in front of og:url and og:image (and the card's footer), so any domain the site answers on previews itself. Options in `public/vinyl-icon-sheet.html`.
- `scripts/vinyl-covers.mjs` (`npm run vinyl-covers`): fetches covers and facts for new records. Run it on Casey's Mac; cloud machines can't reach MusicBrainz or Apple.
- Edit mode (Casey only): `src/app/api/crate/*` and `src/lib/crate.ts`. Edits live in Upstash Redis (`src/lib/kv.ts`) under `crate:edits`, uploaded covers under `crate:img:<id>`, served from `/api/crate/img/<id>`. Keep those paths: saved edits point at them.

## Settings

Env vars (never print them): CRATE_KEY, KV_REST_API_URL and KV_REST_API_TOKEN (the same Upstash database as caseycavanagh.com's likes), SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (Play links for visitor crates), DISCOGS_TOKEN (optional).

## Design

- Always dark. The system font for text (`--sans`: system-ui), Geist Mono where something should look mono (`public/fonts/geist-mono.woff2`). Tabular figures. Link previews (`src/lib/og.tsx`) still draw in Instrument Sans, since they render on a server with no system font.
- Motion is calm: springs without overshoot, quick fades out. Respect reduced motion.
- A quiet interface: no instructions, no counts or "n of n" on the dial.
- Voice: plain, warm, short, sentence case, US English.
