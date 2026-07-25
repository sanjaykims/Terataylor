---
name: graphify
description: Query or refresh the Terataylor Graphify knowledge graph
---

# Workflow: Graphify

Use this workflow before broad manual source exploration.

1. If `graphify` is not on PATH, install it in a temp venv:

```bash
GRAPHIFY_VENV="${TMPDIR:-/tmp}/graphify-phase-a-venv"
python3.14 -m venv "$GRAPHIFY_VENV"
"$GRAPHIFY_VENV/bin/python" -m pip install graphifyy
export PATH="$GRAPHIFY_VENV/bin:$PATH"
```

2. Ask the graph first:

```bash
graphify query "<question>"
graphify explain "<node>"
graphify path "<A>" "<B>"
```

3. Refresh after code changes:

```bash
graphify extract . --code-only --out .
graphify cluster-only . --graph graphify-out/graph.json --no-label
graphify tree --graph graphify-out/graph.json --output graphify-out/GRAPH_TREE.html --root . --label Terataylor
```
