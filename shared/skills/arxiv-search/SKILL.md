---
name: arxiv-search
description: Search and fetch arXiv papers using local scripts. Use for academic paper discovery, arXiv paper lookup, and reading arXiv HTML papers for synthesis or review.
disable-model-invocation: false
---

# arXiv CLI

Use the scripts in `scripts/` for arXiv search and HTML paper fetches. They use only standard Python plus `pandoc` for HTML-to-text conversion.

Run commands from this skill directory unless you provide an absolute script path. The scripts print readable text by default, support `--json` where useful, and print specific `Error:` lines to stderr on failure.

## Commands

Always invoke scripts by path from this skill directory:

```bash
python3 scripts/arxiv-search.py "ti:rotary AND abs:position AND cat:cs.LG" --num 10
python3 scripts/arxiv-search.py "abs:\"rotary position embedding\" AND cat:cs.CL" --sort submittedDate
python3 scripts/arxiv-fetch.py 2104.09864 --max-chars 12000
```

## Search

Use `arxiv-search.py` first to find candidate papers:

```bash
python3 scripts/arxiv-search.py "retrieval augmented generation" --num 8
python3 scripts/arxiv-search.py "ti:transformer AND cat:cs.CL" --sort relevance
python3 scripts/arxiv-search.py "cat:cs.LG AND abs:diffusion" --sort submittedDate
```

Options:

- `--num N`: result count, default 10, max 50.
- `--sort SORT`: `relevance`, `submittedDate`, or `lastUpdatedDate`; default `relevance`. Use `submittedDate` for recent/latest requests.
- `--json`: print parsed results as JSON.

Build precise queries. arXiv field prefixes include `ti:` (title), `au:` (author), `abs:` (abstract), `cat:` (category, e.g. `cs.LG`, `cs.CL`, `stat.ML`), and `all:` (everything). Combine terms with `AND`, `OR`, and `ANDNOT`.

Avoid naked `all:` plus wide `OR` for ambiguous terms. For short tokens like RoPE, MoE, or RAG, restrict to `ti:` or `abs:` and add `cat:` constraints. If the user provides an arXiv id, use `id:<id>` rather than broad search.

## Fetch

Use `arxiv-fetch.py` after search when one paper is worth reading more deeply:

```bash
python3 scripts/arxiv-fetch.py 1706.03762 --max-chars 20000
python3 scripts/arxiv-fetch.py https://arxiv.org/abs/2104.09864 --output /tmp/arxiv-2104.09864.txt
```

Options:

- `--max-chars N`: max text characters in readable stdout, default 20000.
- `--output PATH`: write the full converted text to a file and print a short status line.

Never fetch the PDF. If the script says the paper has no arXiv HTML version, tell the user and stop unless they ask for another retrieval path.

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
- If output is too verbose, retry with fewer results or a lower `--max-chars` value.
