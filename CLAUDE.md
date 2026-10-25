# CLAUDE.md, Remembering Thamus

## Project

A static teaching page for the AI4RA workshops at the University of Idaho. One research compliance question is answered five ways, by the same model: from memory, from pasted text, from a web search, from a vector database of 2 CFR 200, and from the regulation itself, read live over MCP. The framing is Plato's Thamus; the README is the essay and the page is the demonstration. Authors: Nathan Layman and Bert Baumgaertner.

## Layout

- `docs/` is the GitHub Pages source. Vanilla ES modules, no build step, no framework. The shell (header, key modal, sessionStorage key, `?key=`) mirrors Data Crawler Carl and Promptulus.
  - `js/app.js` the five columns and their prompts
  - `js/api.js` the model bridge: `mr2_` keys go to MindRouter through the lakehouse proxy, other keys to Gemini
  - `js/mcp.js`, `js/ecfr-lookup.js`, `js/web-search.js` calls to the AI4RA MCP server (no key, any origin)
  - `js/embeddings.js` the embedding model, size and query and passage text for each backend; the page and the build both import it
  - `js/vector-index.js` loads `docs/index/`, has the backend embed the question, and ranks the passages in the browser
  - `index/` the passages of 2 CFR 200 and one vector file per backend, built, not hand-edited
- `scripts/` builds the index (`fetch_corpus.py`, then `embed_corpus.mjs`) and serves the site locally with a `/v1` proxy (`serve.py`). `node_modules/` stays out of git.
- Root: README (the essay), LICENSE (Apache 2.0, code), LICENSE-CONTENT.md (CC BY 4.0, text), NOTICE, CITATION.cff.

## Rules

- Every column asks the same model the same way. Only what it is handed differs. Keep it that way; the comparison is the lesson.
- The query vector and the passage vectors must come from the same model, size and wrapping text. All three live in `docs/js/embeddings.js`; change one, rebuild that backend's vectors.
- Never commit a key. The workshop key travels on the QR code's URL and lives in sessionStorage.
- No em dashes in prose. Use commas, periods, or "and".
- Sibling repos (data-crawler-carl, promptulus, ai4ra-mcp, NCURARegionalWorkshop2026) are read-only context.
- Infrastructure stays out of git. Proxy and host configuration (Caddy snippets, allowlists, anything about the lakehouse VM) goes under `deploy/`, which is ignored, or stays on the host. The README may say what an origin needs, never the config itself.

## Local preview

```bash
python3 scripts/serve.py        # http://localhost:4173, proxies /v1 to MindRouter
```

A plain static server works for everything except the model calls.

## Rebuilding the index

```bash
cd scripts && npm run build          # or: npm run embed -- gemini, to re-embed one backend
```

Fetches the current 2 CFR 200 from the eCFR, cuts it into passages, has each backend whose key is set embed them, and writes `docs/index/`. Keys come from the environment or from `.env` at the root (`MINDROUTER_API_KEY`, `GEMINI_API_KEY`), which is gitignored; never commit it. Commit the result.
