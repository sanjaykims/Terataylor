# AGENTS.md - Terataylor

Read `CLAUDE.md` before writing code; it contains the product context,
architecture notes, commands, and design constraints for this repo.

## Graphify First

This repo commits a Graphify snapshot in `graphify-out/`. For all future
development in this repo, Codex, Claude Code, and Antigravity must use
Graphify before broad source exploration. For codebase questions, architecture
work, impact analysis, and "where is X?" exploration, consult Graphify before
broad source browsing.

If `graphify` is not already on PATH, install it in a temp venv:

```bash
GRAPHIFY_VENV="${TMPDIR:-/tmp}/graphify-phase-a-venv"
python3.14 -m venv "$GRAPHIFY_VENV"
"$GRAPHIFY_VENV/bin/python" -m pip install graphifyy
export PATH="$GRAPHIFY_VENV/bin:$PATH"
```

Rules:

- Start with `graphify query "<question>"` when `graphify-out/graph.json`
  exists.
- Use `graphify explain "<node>"` for a focused concept and
  `graphify path "<A>" "<B>"` for relationships between two parts of the app.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or
  when query/path/explain do not return enough context.
- After modifying code, refresh the snapshot with:

```bash
graphify extract . --code-only --out .
graphify cluster-only . --graph graphify-out/graph.json --no-label
graphify tree --graph graphify-out/graph.json --output graphify-out/GRAPH_TREE.html --root . --label Terataylor
```

Dirty `graphify-out/` files are expected after code changes; keep them in the
same commit when the graph changed.

