# Evals

Local eval harness for measuring mypi prompt changes instead of eyeballing
them. Design and roadmap: [docs/proposals.md — P6](../docs/proposals.md).
This is phase 1: deterministic single-turn benchmarks plus run comparison.
Judged benchmarks, trace retrospectives, and orchestrator comparison are
later phases.

Everything runs locally against your configured providers (LM Studio /
Ollama / remote). Nothing here touches GitHub Actions, and run results are
gitignored — only case suites, variants, and graders are tracked.

## The loop

```sh
# 1. Baseline the current preset prompt
node evals/bench.mjs run classifier-labels --models lmstudio/qwen/qwen3-30b --run-id baseline

# 2. Edit the prompt — either agents/classifier.yml directly, or add a
#    candidate variant in evals/benchmarks/classifier-labels/variants.yml

# 3. Rerun and compare
node evals/bench.mjs run classifier-labels --models lmstudio/qwen/qwen3-30b --run-id candidate-1
node evals/bench.mjs compare evals/runs/classifier-labels/baseline evals/runs/classifier-labels/candidate-1
```

`compare` shows per-case deltas with regressions and improvements listed
separately — a mean that went up while three cases regressed is visible, not
hidden. A prompt change is only an improvement if the compare says so.

## Commands

```sh
node evals/bench.mjs run <benchmark> --models <id,...> [options]
node evals/bench.mjs report <run-dir>              # regenerate report.md from artifacts
node evals/bench.mjs compare <run-dir-a> <run-dir-b>
```

Run options: `--thinking off,low,...` (matrix over each model), `--variants
id,...` (subset of variants.yml), `--samples N` (repeat each cell; means are
per-cell), `--limit N` (first N cases), `--run-id <id>` (default timestamp),
`--resume` (continue an interrupted run; errored items rerun, completed items
skip), `--dry-run` (no model calls; deterministic fake answers exercise the
whole pipeline).

Model ids are `provider/model` as pi resolves them (`pi --list-models`).

## How a run works

Matrix `case × model × thinking × variant × sample`, executed serially and
model-grouped (fewest model swaps on a self-hosted box). Each item runs

```
pi --mode json --no-tools --no-skills --no-prompt-templates \
   --no-context-files --no-extensions --no-session \
   --model <id> --thinking <level> --system-prompt <variant> -p <question>
```

so the model sees exactly the variant prompt and the question — no mypi
extensions, skills, or context files. The benchmark's `grader.mjs` scores the
reply immediately (`grade({caseData, answer}) -> {score, maxScore,
description}`); descriptions are diagnostic ("right label, wrong casing" vs
"label buried in longer reply") because they're the feedback prompt tuning
acts on.

Artifacts land in `evals/runs/<benchmark>/<run-id>/` (gitignored): per-item
`args.json`, `output.json`, `answer.txt`, `system-prompt.md`, `parsed.json`,
plus `results.jsonl`, `manifest.jsonl`, `run.log`, `config.json`, and
`report.md` with mean scores per model/variant, per-tag slices, and every
failure with its diagnosis.

## Benchmark layout

```
evals/benchmarks/<name>/
  cases.yml       # cases: id, question, expected, tags
  variants.yml    # system-prompt variants: preset: <agent> or inline text
  grader.mjs      # export function grade({caseData, answer})
```

`preset: classifier` resolves the live `prompt.system` from
`agents/classifier.yml` at run time and pins its sha256 into every record, so
the baseline always tracks the real preset and prompt drift between runs is
detectable. Case and variant files use a strict YAML subset
(`evals/lib/yaml.mjs`); malformed lines are errors, never silently dropped.
