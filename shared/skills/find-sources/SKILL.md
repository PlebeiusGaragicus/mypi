---
name: find-sources
description: >-
  Delegate web source-finding to `web` workers via the `subagent` tool and get
  back citation-ready quotes, URLs, and bibliography data. Use only when the
  user clearly asks for help finding, citing, or verifying a source for a claim
  in their argument — not for general questions you can answer from reasoning.
---

# Find sources with web workers

You hold the `subagent` tool with `web` workers available. A web worker is a fresh agent with search skills (tavily, exa, arxiv, congress.gov) and a browser: it can iterate queries, sift noisy results, and chase documents inside its own disposable context, then return a concise reply. Use it so search noise never enters this conversation.

## When to delegate — and when not to

Delegate only when the user clearly wants sourcing help: they ask to find, cite, verify, or strengthen the evidence for a specific claim, or they accept after you offer. Do not dispatch workers speculatively, mid-elenchus, or to settle a point you can reason through. You are an interlocutor first; delegation serves the argument, it does not replace the dialogue.

Before dispatching, name the exact claim being sourced. If the claim is still vague, sharpen it with the user first — a worker cannot search for a claim that is not yet stated.

## How to task a worker

Workers start with zero conversation context. The task text must be self-contained:

- **The claim, verbatim** — the precise statement needing support.
- **What would confirm or refute it** — workers should return disconfirming evidence too; an argument built on filtered evidence fails the steelman test.
- **Preferred source types** — primary documents, official statistics, dated reporting; name any known-good starting points.
- **The return contract** (below), stated explicitly in the task.

Return contract to request — one block per candidate source, 2–4 candidates, in the worker's final reply (web workers return text, not files):

```text
QUOTE: <verbatim sentence(s) from the source>
URL: <direct link>
AUTHOR/PUBLISHER: <who>  DATE: <published date, or "undated">
ACCESSED: <today's date>
RELEVANCE: <one line: supports/refutes which part of the claim>
```

Ask the worker to flag paywalls, undated pages, and anything it could not verify, and to prefer fewer well-grounded sources over many weak ones.

## Parallel dispatch

- Parallel workers (`tasks[]`, max 4) are for **genuinely independent claims or sub-questions** — one worker per claim, typically 2–3.
- Never parallelize query variations of the same claim: a single worker iterates queries itself.
- A failed worker reports its failure reason (exit code, output-token limit, empty reply). Retry once with a narrower task, or record the gap as an open question in the argument — do not paper over it.

## Handling returns

- Treat returned quotes as **unverified** until you or the user checks them; label them quote vs. inference vs. speculation per the how-to-debate quality pass.
- Select only the material that serves the argument; do not paste full worker returns into the conversation.
- Incorporate keepers as `Highlight` blocks (blockquote + **Source:** line) or `Definition` evidence in the Argument file, per the how-to-debate skill.
