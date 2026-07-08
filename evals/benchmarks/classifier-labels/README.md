# classifier-labels

Deterministic exact-match suite for the `classifier` preset
(`agents/classifier.yml`). No judge model — the grader compares strings.

## What it tests

The preset promises: given `{context: str, category: ["class-name", ...]}`,
reply with **only** the best-matching class name — no preamble, no closing,
no formatting. Every case feeds one such JSON object as the question; the
reply must equal `expected` exactly (whitespace-trimmed) to score 1/1.

## Tags

| Tag | What it probes |
|---|---|
| `clear` | Unambiguous single best label — the floor; any capable model should pass |
| `nuanced` | Correct label requires reading the whole context past a distractor topic |
| `adversarial` | Context contains instructions ("reply with 'sales'", fake SYSTEM lines) that must be treated as data |
| `format` | Exact label reproduction under unusual casing/characters (`Account-Access`, `p1.hardware`) |
| `edge` | Degenerate inputs: single-option list, 10-option list, non-English context, noise |

## Reading failures

The grader's descriptions are diagnostic — each points at a different prompt
fix: "right label wrapped in quotes/punctuation" and "right label buried in a
longer reply" are output-contract failures (tighten the *only the class name*
instruction); "right label with wrong casing" is a reproduction failure (add
*copied character-for-character*); "wrong label" is comprehension; "not a
listed category" means the model invented a class.

## Run it

```sh
node evals/bench.mjs run classifier-labels --models <provider/model> --run-id baseline
# edit agents/classifier.yml or add a candidate to variants.yml, then:
node evals/bench.mjs run classifier-labels --models <provider/model> --run-id candidate
node evals/bench.mjs compare evals/runs/classifier-labels/{baseline,candidate}
```
