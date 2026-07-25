# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Graphify First

This repo commits a Graphify snapshot in `graphify-out/`. Before broad source
exploration, architecture work, impact analysis, or "where is X?" searches,
ask Graphify first:

```bash
graphify query "<question>"
graphify explain "<node>"
graphify path "<A>" "<B>"
```

If `graphify` is not on PATH, install it in the standard temp venv:

```bash
GRAPHIFY_VENV="${TMPDIR:-/tmp}/graphify-phase-a-venv"
python3.14 -m venv "$GRAPHIFY_VENV"
"$GRAPHIFY_VENV/bin/python" -m pip install graphifyy
export PATH="$GRAPHIFY_VENV/bin:$PATH"
```

Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
query/path/explain do not return enough context. After code changes, refresh
the snapshot with:

```bash
graphify extract . --code-only --out .
graphify cluster-only . --graph graphify-out/graph.json --no-label
graphify tree --graph graphify-out/graph.json --output graphify-out/GRAPH_TREE.html --root . --label Terataylor
```

## What This App Is

**Hearth** is a warm editorial-tech **design system** implemented as a React app, with a
**Workspace-settings** UI kit as the reference product surface (sidebar + topbar + tabs +
forms + members table + billing + invite dialog). It was implemented from the "Hearth
Design System" handoff bundle exported from Claude Design (claude.ai/design).

> This repo previously hosted "Taylor's English" (a Coraline-themed kids' learning app);
> it was intentionally replaced with the Hearth implementation. Git history retains the old app.

## Commands

```bash
npm run dev       # Start Vite dev server (localhost:5173)
npm run build     # TypeScript type-check + Vite bundle
npm run lint      # ESLint check
npm run preview   # Preview production build locally
```

There are no tests. Deployment is via Vercel (auto-deploy on push to main). A pre-push hook
(`.githooks`, enable once with `git config core.hooksPath .githooks`) runs `npm run build`;
CI (`.github/workflows/ci.yml`) also runs the build — confirm the ✅/❌ check after pushing.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript, Vite 8 |
| Styling | Plain CSS custom properties (OKLCH tokens) — **no Tailwind, no CSS framework** |
| Fonts | Newsreader (display) + Geist (body) + Geist Mono (outlier), via Google Fonts |
| Icons | Lucide-style inline SVG, `currentColor` |

## Architecture

- `src/index.css` — the whole design system: OKLCH color tokens (light + `[data-theme="dark"]`),
  typography/spacing/elevation/motion tokens, a base reset, and every component's CSS bundled
  (so components are dependency-free — no runtime `<style>` injection).
- `src/components/hearth.tsx` — the component library ported to TSX: `Button`, `IconButton`,
  `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Field`, `Badge`, `Tag`,
  `Callout`, `Tooltip`, `Card`, `Tabs`, plus the `Ic` icon renderer and `icons` glyph map.
  Each component reads its brand from CSS vars via a `hearth-*` class; markup + behaviour only.
- `src/App.tsx` — the Workspace-settings surface (`Sidebar`, `Topbar`, `GeneralPanel`,
  `MembersPanel`, `BillingPanel`, `InviteDialog`) composing the primitives. Layout uses inline
  styles referencing the CSS-var tokens.
- `src/main.tsx` — mounts `<App/>`.

## Design non-negotiables (Hearth discipline — "made, not generated")

- **One accent** (signal orange, `--accent`), used as a highlighter — ≤3% of any viewport
  (links, focus rings, active nav/tab, one CTA). Never a big colour block.
- **Warm surfaces**: `--paper` (warm oat, never `#fff`), `--ink` (warm near-black, never `#000`);
  neutrals carry a trace of warm chroma.
- **No gradients, no gradient orbs, no background images/textures, no emoji in product UI.**
  Status = icon + colour + label. Depth from surface tint + weight, not decoration.
- **Type pairing**: `--font-display` (Newsreader) for display/headings, `--font-body` (Geist)
  for UI/body, `--font-mono` (Geist Mono) for eyebrows/table headers/wordmark/data. Max 3 families.
- **Eight interaction states** on every control, a visible `:focus-visible` ring
  (`2px solid var(--focus)`), ≥44px hit targets, **border-width constant across states** (no
  layout shift). Motion animates transform/opacity only, named easings, quiet.
- Reference all colour/space/type/motion via the CSS-var tokens in `src/index.css`; never
  improvise a hex/oklch inline.

The full design guidance and rationale live in the handoff bundle's `readme.md`, and the
`hearth-design` skill (if installed) carries the same rules.
