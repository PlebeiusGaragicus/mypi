---
name: arxiv-search
description: Search and fetch arXiv papers using bare arxiv-search and arxiv-fetch (path-promoted). Use for academic paper discovery, arXiv paper lookup, and reading arXiv HTML papers for synthesis or review.
disable-model-invocation: false
---

# arXiv CLI

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Run **`arxiv-search`** and **`arxiv-fetch`** by basename only (do not call `python3` with paths into this skill).

The scripts use only standard Python plus `pandoc` for HTML-to-text conversion. They print readable text by default, support `--json` where useful, and print specific `Error:` lines to stderr on failure.

## Commands

```bash
arxiv-search "ti:rotary AND abs:position AND cat:cs.LG" --num 10
arxiv-search "abs:\"rotary position embedding\" AND cat:cs.CL" --sort submittedDate
arxiv-fetch 2104.09864
```

## Search

Use **`arxiv-search`** first to find candidate papers:

```bash
arxiv-search "retrieval augmented generation" --num 8
arxiv-search "ti:transformer AND cat:cs.CL" --sort relevance
arxiv-search "cat:cs.LG AND abs:diffusion" --sort submittedDate
```

Options:

- `--num N`: result count, default 10, max 50.
- `--sort SORT`: `relevance`, `submittedDate`, or `lastUpdatedDate`; default `relevance`. Use `submittedDate` for recent/latest requests.
- `--json`: print parsed results as JSON.

Build precise queries. arXiv field prefixes include `ti:` (title), `au:` (author), `abs:` (abstract), `cat:` (category, e.g. `cs.LG`, `cs.CL`, `stat.ML`), and `all:` (everything). Combine terms with `AND`, `OR`, and `ANDNOT`.

Avoid naked `all:` plus wide `OR` for ambiguous terms. For short tokens like RoPE, MoE, or RAG, restrict to `ti:` or `abs:` and add `cat:` constraints. If the user provides an arXiv id, use `id:<id>` rather than broad search.

## Fetch

Use **`arxiv-fetch`** after search when one paper is worth reading more deeply:

```bash
arxiv-fetch 1706.03762
arxiv-fetch 1706.03762 --max-chars 12000
arxiv-fetch https://arxiv.org/abs/2104.09864 --output /tmp/arxiv-2104.09864.txt
```

Options:

- Default stdout is the **full** converted plain text (no truncation). Host tools may still cap captured output; use `--output` to a workspace file when you need the entire file on disk.
- `--max-chars N`: optional; truncate stdout to N characters and append `...[truncated]` (for quick previews only).
- `--output PATH`: write the full converted text to a file and print a short status line.

Never fetch the PDF unless explicitly instructed. If the script says the paper has no arXiv HTML version, tell the user and stop unless they ask for another retrieval path or were clear about wanting PDF versions.

## Workflow

1. Search with 5-10 results unless the task clearly needs broader coverage.
2. Answer the user's actual question in the same turn using the search results when possible; do not return only a list unless they asked for one.
3. Fetch full paper text only after a specific candidate is selected or clearly necessary.
4. For paper-specific answers, cite paper section headings. Quote sparingly; prefer paraphrase with section references.
5. Run at most one equivalent search per user message. Re-search only when the query changes.
6. Be polite: arXiv asks for about 1 request per second at most; never poll.

## Failure Handling

- If a script exits nonzero, read stderr before retrying.
- If search returns no results, suggest broadening the query by dropping field prefixes, removing `AND` clauses, or trying synonyms.
- If **search** output is too verbose, retry with fewer results. For **fetch**, use `--max-chars` only when you want a short stdout preview; otherwise rely on full stdout or `--output`.
