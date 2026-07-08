# Evals

Local eval harness for measuring mypi prompt changes instead of eyeballing
them. Design and roadmap: [docs/proposals.md — P6](../docs/proposals.md).
Phases 1–4 are implemented: deterministic and LLM-judged single-turn
benchmarks, run comparison, trace retrospectives, and the workflow bench.
The agent-driven eval loop is the remaining phase.

Current benchmarks:

- `classifier-labels` — deterministic exact-match suite for the classifier preset
- `judge-verdicts` — deterministic PASS/FAIL suite for the judge preset
  (verdict correctness and format compliance scored separately)
- `bullshit-detector` — 100 judged cases (0–2): does the model call out
  professional-sounding nonsense? (ported from EXAMPLE/pi-bench)
- `skibidi` — 17 judged cases (0/1): current internet slang knowledge
  (ported from EXAMPLE/pi-bench)

Everything runs locally against your configured providers (LM Studio /
Ollama / remote). Nothing here touches GitHub Actions, and run results are
gitignored — only case suites, variants, and graders are tracked.

## Quick start

```sh
./bench          # from the repo root (or: npm run bench, node evals/bench.mjs)
```

That's the whole interface: a home menu covering everything —

1. **Run a benchmark** — pick a suite, your models (listed from
   `~/.pi/agent/models.json`), thinking modes, variants, judge model for
   judged suites, samples/limit; see an estimated call count; launch.
2. **Run a workflow task** — pick the orchestrator model and one task from
   the library; score the result when it finishes.
3. **Score a workflow run** — record your 0–2 verdict after reading the
   deliverable.
4. **Retro a trace** — procedural checks over a workflow's subagent trace.
5. **Compare two runs** — did a prompt change actually help?
6. **Rebuild a report** / 7. **Clean up**.

Every menu flow prints the equivalent `bench <command>` one-liner before it
launches, so anything you do interactively is reproducible as a direct
command afterward. The subcommands below are that same surface, for
scripting.

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
./bench                                  # interactive menu
./bench run <benchmark> --models <id,...> [options]
./bench workflow <name> --model <id> [--task N] [--program path]
./bench feedback <run-dir> --score <0-2> [--note text]
./bench retro <trace-dir> [--judge-model id]
./bench report <run-dir>                 # regenerate report.md/.html from artifacts
./bench compare <run-dir-a> <run-dir-b>
./bench clean [--yes]                    # delete all run artifacts
```

Run options: `--thinking off,low,...` (matrix over each model), `--variants
id,...` (subset of variants.yml), `--samples N` (repeat each cell; means are
per-cell), `--limit N` (first N cases), `--run-id <id>` (default timestamp),
`--resume` (continue an interrupted run; errored items rerun, completed items
and usable answer/judge artifacts skip), `--dry-run` (no model calls;
deterministic fake answers and judge scores exercise the whole pipeline).
Judged benchmarks (those with a `judge-template.md`) also require
`--judge-model <id>` and accept `--judge-thinking <level>`.

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
extensions, skills, or context files. Execution is phased like pi-bench:
all answers first (model-grouped), then all judge calls as one contiguous
block (the judge model loads once), then grading. The judge gets a fixed
impartial system prompt and the benchmark's `judge-template.md` rendered
with `{question}`, `{response}`, and any case fields (`{judge_hint}`,
`{expected_answer}`, ...). Judges must return `Score:` / `Description:`
lines; anything else is a grade error, never a coerced score.

The benchmark's `grader.mjs` scores each item
(`grade({caseData, answer, judgeText}) -> {score, maxScore, description}`);
descriptions are diagnostic ("right label, wrong casing" vs "label buried in
longer reply") because they're the feedback prompt tuning acts on.

Artifacts land in `evals/runs/<benchmark>/<run-id>/` (gitignored): per-item
`answer/` and `judge/` dirs (`args.json`, `output.json`, `answer.txt` /
`judge.txt`, `prompt.txt`, `system-prompt.md`) plus `parsed.json`, and
run-level `results.jsonl`, `manifest.jsonl`, `run.log`, `config.json`, and
two reports: `report.md` (mean scores per model/variant, per-tag slices,
every failure with its diagnosis) and `report.html` — a self-contained page
with the same tables plus a filterable item browser (by model, variant, tag,
pass/fail/error, free-text search) where each item expands to show the
question, the full answer, and the judge's verdict. Open it straight from
disk; there are no external assets.

## Workflow bench

Workflow prompts are natural-language programs; the wording of the program
text is the main thing to iterate. `bench workflow` runs ONE task from a
task library through a workflow program and attaches your verdict:

```sh
node evals/bench.mjs workflow deepresearch --model lmstudio/qwen/qwen3.6-35b-a3b
```

`--model` is required — the orchestrator model is always an explicit choice.
Without `--task N`, a menu lists the library
(`evals/tasks/deepresearch.txt`, one prompt per line, `#` section headers —
never run in bulk). The run launches `pi --preset workflow` in a fresh
workspace under `evals/runs/workflow/<name>/<run-id>/workspace/`, with the
program (`shared/prompts/workflow/<name>.md`, or `--program <path>` for a
scratch revision) plus the task as the prompt.

Versioning is git plus archival: every run copies the exact program text it
executed to `<run-dir>/program.md` and pins its sha256 in the records, so
two runs are diffable (`diff a/program.md b/program.md`) after the source
file has moved on — no separate version registry.

After the run it prints the workspace, deliverable, and trace paths (with a
ready-made `bench retro` command for the trace — retro is manual here by
design) and asks for a 0–2 score plus a note; skip it and record later with
`bench feedback <run-dir> --score N --note "..."` after actually reading the
deliverable. The verdict is a normal record, so the loop is:

```sh
# edit shared/prompts/workflow/deepresearch.md, then:
node evals/bench.mjs workflow deepresearch --model <id> --task 7
node evals/bench.mjs feedback evals/runs/workflow/deepresearch/<new-run> --score 2 --note "..."
node evals/bench.mjs compare evals/runs/workflow/deepresearch/{<old-run>,<new-run>}
```

`task-N/run` cells compare completion; `task-N/verdict` cells compare your
judgment of the deliverable across program revisions.

## Trace retrospectives

`bench retro` scores an existing workflow trace
(`.pi/subagent-traces/<run-id>/`) instead of running new prompts:

```sh
node evals/bench.mjs retro .pi/subagent-traces/<run-id> --judge-model <id>
```

Scripted checks read facts straight from `manifest.json` and the worker
session JSONL files — no model calls: worker completed cleanly, final reply
non-empty, task under the 4k `{previous}`-blowup threshold, no failed tool
calls, no identical-tool-call loops, session ends with assistant text.
With `--judge-model`, each worker's final reply is additionally judged 0–2
for task fulfillment. Results land in `evals/runs/retro/<run-id>/` as
standard records — records map model = the LLM the worker ran on and
variant = the agent preset name, so the same reports answer "which agent
prompt misbehaves" and, across traces, "which local model works best" —
and `report.html` / `bench compare` work unchanged (rerun the same workflow
after a prompt fix and compare the two retro runs).

## Benchmark layout

```
evals/benchmarks/<name>/
  README.md          # what the benchmark tests, rubric, tags, how to run it
  cases.yml          # cases: id, question, tags, + expected / judge_hint / etc.
  variants.yml       # system-prompt variants: preset: <agent> or inline text
  grader.mjs         # export function grade({caseData, answer, judgeText})
  judge-template.md  # optional; its presence makes the benchmark judged
```

`preset: classifier` resolves the live `prompt.system` from
`agents/classifier.yml` at run time and pins its sha256 into every record, so
the baseline always tracks the real preset and prompt drift between runs is
detectable. Case and variant files use a strict YAML subset
(`evals/lib/yaml.mjs`); malformed lines are errors, never silently dropped.
