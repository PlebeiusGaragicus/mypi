# skibidi

Does the model actually know current internet slang? 17 judged cases covering
Generation Alpha / circa 2023–2025 terms. Ported from `EXAMPLE/pi-bench`.
Useful as a fast knowledge-recency probe for local models — it separates
models trained on recent data from those bluffing via etymology.

## What it tests

Each case asks "In context of internet slang, what does X mean?" The judge
compares the reply against the case's `expected_answer` (the canonical
meaning plus what a satisfactory answer must include) and scores binary:

- **0** — mostly wrong, literal-only (e.g. Ohio the state), a non-answer, or
  vague enough to leave a false understanding
- **1** — the user walks away with the core meaning; brevity is fine,
  nuance/origin optional

## Fields

Beyond `id`/`question`, cases carry `term` (the slang being tested) and
`expected_answer` (judge-only grading guidance — the answer model never sees
it). Two cases (`skibidi-ohio-rizz`, `sigma`) originally leaked their
definitions inside the question text; the leak was moved into
`expected_answer`, so pre-fix runs score those two cases artificially high
and shouldn't be compared against post-fix runs.

## Run it

```sh
node evals/bench.mjs run skibidi \
  --models <model-under-test,...> \
  --judge-model <strongest model, ideally a different family>
```

~17 answer + ~17 judge calls per model/variant — cheap enough to run across
every local model in one sitting. `baseline` vs `baseline-concise` variants
test whether a brevity nudge costs correctness.
