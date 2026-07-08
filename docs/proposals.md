# Proposals

Design changes under consideration. Nothing on this page is implemented unless explicitly noted — it exists so decisions get made deliberately instead of drifting in during refactors.

---

## P1 — Explicit on-disk instruction pointer for workflows

**Status: proposed, not implemented.**

The `workflow` preset's system prompt tells the orchestrator to "maintain an implicit instruction pointer" — to remember, in context, which phase of the workflow program is active. Strong models do this fine. A ~30B local model deep into a 10-phase workflow, with a dozen worker returns accumulated in context, will eventually lose its place: skip a validation gate, re-run a completed phase, or forget a blocker condition.

The fix is to externalize that state. The trace directory already exists per run; the proposal is to require the orchestrator to also maintain a plan file, e.g.:

```text
.pi/subagent-traces/<run-id>/plan.md
```

containing the workflow's phases as a checklist, updated after every worker return:

```markdown
- [x] 1. Preflight — dirs created
- [x] 2. Source scout — 7 sources listed
- [ ] 3. Parallel collection — IN PROGRESS (4/7 collected, 1 failed: paywall)
- [ ] 4. Draft report
...
```

The orchestrator prompt would then instruct: *before every transition, read the plan file; after every worker return, update it.* This converts "remember where you are" into "read where you are" — the degradation-resistant move for long contexts and weak models. It also makes runs resumable and inspectable for free (the `retro.md` workflow would benefit directly).

Cost: one extra read/write per transition, a slightly longer orchestrator prompt. Implementation is prompt-only — no code changes needed. Workflow authors can trial it today by adding a "maintain a phase-checklist file" instruction to an individual workflow prompt before we commit it to the `workflow` preset's system prompt.

---

## P2 — Parallel worker cap (partially implemented: capped at 4)

**Status: cap lowered from 100 to 4. Configurability still open.**

`subagent`'s parallel mode previously allowed up to 100 concurrent workers. It is now capped at 4, matching LM Studio's concurrent-request limit.

**Why the cap matters even though LM Studio queues requests.** It's true that the inference server queues excess requests rather than crashing — but the queue is only the last link in the chain. Each parallel task spawns a *full `pi` process* on this machine: a Node/Bun runtime, session state, an open HTTP connection held for the entire wait. Launching 100 at once means:

1. **Local resource pressure** — 100 processes × runtime overhead, before a single token is generated.
2. **Timeout risk** — a worker at position 90 in the queue holds its connection open through ~89 × (full worker runtime) of dead waiting. Client or server timeouts turn "slow" into "failed," and the orchestrator sees spurious error returns.
3. **All-or-nothing result reporting** — parallel results return only when *all* workers finish, so one queue-stuck straggler stalls the whole workflow phase.
4. **No backpressure signal** — the orchestrator (and you, watching) can't distinguish "model is working" from "89 processes are idling in a queue."

A cap of 4 means at most 4 processes exist at a time and every launched worker is actually being served. The orchestrator naturally batches larger fan-outs into successive calls of ≤4.

**Open question for consideration:** should the cap be configurable via `mypi.env` (e.g. `SUBAGENT_MAX_PARALLEL=4`) so a beefier inference box can raise it without a code change? Lean yes, but it's one more knob.

---

## P3 — Bound the `{previous}` substitution in chain mode

**Status: proposed, not implemented.**

**What `{previous}` is:** in `subagent` chain mode, each step runs after the one before it, and the literal string `{previous}` in a step's task text is replaced with the *entire final reply* of the previous worker. Example:

```json
{ "chain": [
  { "agent": "scout", "task": "List every test file in this repo." },
  { "agent": "chat",  "task": "Group these files by subsystem: {previous}" }
] }
```

If the scout returns 6,000 words, all 6,000 words are spliced into the second task — which becomes part of the second worker's context *and* is stored in the trace manifest and orchestrator context. There is currently no truncation and no warning.

**Why it matters here:** the whole architecture exists to keep contexts small for weak local models. `{previous}` is the one data path that can silently blow that up. (The trace manifest already truncates stored replies to 4,000 characters; the actual substitution does not.)

**Recommendation:** cap the substituted text (e.g. 4,000 characters, matching the manifest cap) and append a marker like `[... truncated; full reply in <traceDir>]` when truncation occurs. Workers that need the full material should be handed a file path instead — which is already the documented best practice ("prefer file handoffs for long outputs"). This makes the tool enforce the convention instead of merely recommending it.

Alternative considered: reject over-long substitutions with an error return so the orchestrator reformulates with a file handoff. Stricter, but error-recovery loops are exactly what weak models are bad at; silent-but-marked truncation is the safer default.

---

## P4 — Strict mode for the preset YAML parser

**Status: proposed, not implemented.**

`shared/presets/runtime.mjs` contains a hand-rolled ~200-line YAML subset parser (`parsePresetYaml`). It handles exactly what the preset schema needs — block scalars, flat lists, one-level maps — and **silently ignores everything else**. That's the risk: a mis-indented key, a typo'd field name (`promtDirs:`), or an unsupported YAML construct doesn't error; the field simply vanishes from the parsed preset. `presets:check` catches *missing required* fields, but not "optional field parsed as nothing," which is the common failure. This will eventually cost a confusing afternoon: a preset that looks right, validates clean, and quietly lacks a capability.

Two options, in preference order:

1. **Strict unknown-key check (recommended, small).** Keep the zero-dependency parser but make it collect every top-level key it encounters and have `validatePresetRegistry` error on keys outside the known schema, and error on any non-blank line the parser skipped. Typos and indentation mistakes then fail loudly at `presets:check` time. Roughly a 30-line change, no new dependency.
2. **Adopt a real YAML library** (`yaml` on npm). Deletes ~200 lines and gets spec-compliant parsing with real error messages, at the cost of mypi's first runtime npm dependency — a meaningful change for a Pi package that currently installs with zero runtime deps.

The zero-dependency property is worth keeping while option 1 covers the practical failure mode. Revisit option 2 only if the schema outgrows the subset parser (nested structures, anchors, multi-line flow lists).

---

## P5 — Prompt context budget: redundancy trims for weak models

**Status: proposed, not implemented.**

Two places spend context on text that doesn't earn it, which matters most on small local models where every prompt token competes with the actual work.

**5a. The `workflow` system prompt repeats itself.** The worker-boundary rule ("don't ask a worker to use tools it doesn't structurally have") appears three times — in Execution Model, Core Operating Rules, and the Delegation Checklist — and the function-call framing (agent/task/side-effects/return-value) appears twice. Deliberate repetition can help weak models follow rules, but this is ~700 words of preamble before the workflow program itself starts, and the workflow programs are themselves 700–4,000 words. Recommendation: keep the rule in exactly two places — once as a principle in Core Operating Rules, once as a checklist item (checklists are where weak models actually look) — and collapse the duplicated function-call framing into the Subagents As Functions section alone. Target: ~500 words with no rule lost. Verify with `npm run presets:debug-system-prompts` before/after.

**5b. The `code` preset inhales all of AGENTS.md every turn.** `code` sets `includeContextFiles: true`, so in this repo it receives the entire AGENTS.md (~1,000 words of changelog policy, PR process, and PATH-bootstrap internals) on every turn — including when it runs as a workflow worker doing a bounded task where none of that applies. Options:

- Split AGENTS.md: keep a lean agent-facing core (conventions the model needs while editing code) and move contributor process (changelog/PR/release policy) into the docs site, which now covers it under [Development Process](development-process.md).
- Or give `code` a worker variant (`code-worker.yml`) with `includeContextFiles: false` for workflow use, keeping full context for interactive sessions.

The split is the better first move: it helps every repo consumer of AGENTS.md, not just workflows, and requires no preset changes.

---

## P6 — Evals: prompt iteration, trace retrospectives, and orchestrator comparison

**Status: phases 1–2 implemented** (`evals/` harness: deterministic + judged benchmarks, `bench compare`, suites: `classifier-labels`, `bullshit-detector` and `skibidi` ported from EXAMPLE/pi-bench — see [evals/README.md](https://github.com/PlebeiusGaragicus/mypi/blob/main/evals/README.md)). A judge-preset case suite is still open within phase 2. **Phases 3–5 open.**

mypi's presets and workflow prompts are currently tuned by feel. This proposal adds an `evals/` harness so a prompt change can be judged by numbers: run a fixed case suite before and after, compare, keep the change only if it measurably improved. The architecture is ported from the `EXAMPLE/pi-bench` harness (config-per-run, full artifact preservation, judge-with-hint templates, strict `Score:/Description:` parsing, resumable manifests) — the architecture, not the code, which carries dead paths and a non-functioning copied `evals/` shell script.

**End goal (north star, not phase 1):** an agent runs an eval suite, reads the report, finds errors in the traces, proposes prompt fixes, applies them, and reruns — a closed prompt-improvement loop. Everything below is sequenced to get there in small steps.

**Explicitly out of scope:** GitHub Actions. Evals run locally against the LM Studio/Ollama homelab. Results are not committed; only case suites, judge templates, and run configs are tracked.

### Three eval types, one harness

1. **Benchmark evals (single-turn).** A case suite runs through the matrix `case × model × reasoning × system_prompt_variant`, where the prompt-variant dimension holds candidate preset prompts. Two grader tiers per benchmark:
    - *Deterministic:* exact/regex match, no judge. First target: `classifier` (must emit a valid label — cheap, objective, and validates the harness end-to-end).
    - *Judged:* an LLM judge scores 0–2 against a per-case `judge_hint` explaining what a good answer must do. Targets: `judge`, `chat`, `write` preset prompts. The pi-bench judge-template discipline carries over verbatim: per-case hints, anti-gaming rules (generic hedging doesn't count), "do not charitably reinterpret," behavioral rubric.

2. **Trace retrospectives.** Input is an existing `.pi/subagent-traces/<run-id>/` directory (`manifest.json` + per-worker session JSONL). Two grader tiers again:
    - *Scripted checks (deterministic):* invalid tool-call arguments, error returns, retry loops, workers that exceeded the parallel cap, `{previous}` blowups, empty worker replies, phase skips against `plan.md` if P1 lands. These are jq/grep-able facts, no model needed.
    - *Judged dimensions:* instruction following, delegation quality (right agent for the task, side-effects declared), and loop/rambling detection — scored per session by a judge given the worker's preset prompt and its transcript.
    A retro run emits the same record shape as a benchmark run (`score`, `description`, `status`, tags), so reporting and comparison are shared.

3. **Orchestrator comparison.** A fixed suite of workflow tasks is run once per local model *as the orchestrator*, producing one trace per (task, model). The trace retrospective then scores each trace, and the report groups by orchestrator model. This answers "which of my local models is the best orchestrator" with the same machinery — no new eval type, just a driver that varies the orchestrator model over a task list.

### What gets ported from pi-bench, what gets fixed

Keep: run-config contract (one `config.yml` per run, relative paths, prompt text SHA-256 pinned), artifact-per-item layout, append-only `manifest.jsonl` with resume, errors as first-class result records, controlled model inputs (`--mode json --no-tools --no-skills --no-prompt-templates --no-context-files --system-prompt ...` for benchmark calls), markdown report generation.

Fix (the gaps that keep pi-bench a toy):

- **`samples: N` per matrix cell.** N=1 tells you nothing about a stochastic model. Default 3 for judged evals.
- **Tag slicing.** Every case carries `tags`; reports break scores out per tag so "which failure modes did the prompt change fix" is answerable.
- **`bench compare <run-a> <run-b>`.** Per-case score deltas between two runs, flagging regressions and improvements separately. This is the primary tool of the prompt-iteration loop — a mean going up while three cases regress is a fail, and only a per-case diff shows it.
- No plots initially, no matplotlib; markdown tables only.

Language: Node `.mjs` under `scripts/`/`evals/`, matching the repo's existing zero-runtime-dependency script conventions — this is a port of the design, not the Python.

### Layout

```text
evals/
  README.md
  benchmarks/
    classifier-labels/            # phase 1: deterministic
      cases.yml                   # id, question, expected, tags
      grader.mjs                  # exact-match grader
    judge-rubric/                 # phase 2: judged
      cases.yml                   # id, question, judge_hint, tags
      judge-template.md
  retro/
    checks.mjs                    # scripted trace checks
    judge-template.md             # per-session judged dimensions
  tasks/
    orchestrator-suite.yml        # phase 4: fixed workflow tasks
  runs/                           # gitignored
    <benchmark>/<run-id>/config.yml + artifacts + report.md
```

### Phases

1. **Harness core + deterministic benchmark.** Runner, matrix expansion, artifacts, resume, report, `bench compare`, and the `classifier-labels` suite (~20 cases). Proves the loop: edit `classifier.yml`, rerun, compare.
2. **Judged benchmark.** Judge call + `Score:/Description:` parser + one suite for the `judge` preset (~20 cases with hints). Judge model is pinned in config and should differ from the answer model where possible.
3. **Trace retrospective.** `bench retro <trace-dir>` runs scripted checks, then judged dimensions per worker session, and writes the standard report. Works on any existing trace — immediately useful for debugging workflow runs.
4. **Orchestrator comparison.** Driver that runs `tasks/orchestrator-suite.yml` once per configured model as orchestrator, then invokes the phase-3 retro on each trace and emits a grouped comparison report.
5. **Close the loop.** An eval-runner skill/agent: run suite → read report + compare against baseline run → inspect failing artifacts → propose a prompt edit (as a diff, for human approval initially) → rerun → report the delta. Only worth building once phases 1–3 have made "run and compare" a one-command operation.

**Open questions:** whether the judge should run through `pi` (uniform, uses provider config) or hit the OpenAI-compatible endpoint directly (fewer moving parts); and whether retro judged dimensions score per-session or per-worker-task when a session contains several. Lean `pi` and per-session to start.
