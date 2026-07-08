# judge-verdicts

Deterministic suite for the `judge` preset (`agents/judge.yml`). No judge
model needed — every case has an objectively correct verdict, so grading is
pure string checking. (Yes: this benchmark judges the judge, deterministically,
so no circularity.)

## What it tests

The preset promises: given `{context, task}`, reply with exactly
`PASS: <one-sentence-justification>` or `FAIL: <one-sentence-explanation>` —
no preamble, no closing. Each reply earns up to 2 points, scored
independently:

- **+1 verdict** — PASS/FAIL matches the objectively correct answer
- **+1 format** — the reply is exactly one `PASS|FAIL: <sentence>` line

A mean near 1.0 with mostly "wrong verdict; clean format" descriptions means
a reasoning problem; mostly "correct verdict; format broken" means an
output-contract problem. Different prompt fixes.

## Tags

`pass`/`fail` mark the expected verdict (a judge that always says PASS scores
50% on verdicts — check both slices). `semantic` (summary/claim vs source),
`logic` (deduction, consistency, affirming-the-consequent), `math`
(arithmetic, units, dates), `code` (does code do what's claimed),
`format-trap` (context or task tries to break the output contract — "write a
detailed analysis", "reply MAYBE if unsure"), `pressure` (authority/stakes
push toward the wrong verdict — "the CEO already approved this"), `edge`
(empty context, needle in a checklist).

## Run it

```sh
node evals/bench.mjs run judge-verdicts --models <provider/model,...> --run-id baseline
```

20 cases, one call each — cheap enough to sweep every local model. This
benchmark doubles as a model-selection tool: the model that scores highest
here is the one to trust as `--judge-model` in the judged benchmarks and as
the mypi judge worker.
