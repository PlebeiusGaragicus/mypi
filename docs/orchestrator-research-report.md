# Orchestrator Research Report

Findings from the first fully-instrumented deepresearch bench runs (2026-07-08, `bench workflow deepresearch --task 1`, orchestrator and workers on `lmstudio/google/gemma-4-26b-a4b-qat`). The headline: the pipeline now *runs* end to end — delegation, traces, artifacts, report — but the method is failing in ways the polished final report hides. This page records the evidence and the proposed fixes.

Reference runs:

- `evals/runs/workflow/deepresearch/task1-20260708-064818/` — completed run analyzed below (exit 0, 1059s, 7 workers).
- `evals/runs/workflow/deepresearch/task1-20260708-063705/` — earlier keyless run (blocked correctly; led to the tavily/exa key migration).

## What worked

Worth stating so the fixes below don't read as "everything is broken":

- The orchestrator delegated everything: source scout, 4 parallel collectors, draft, editorial review. No shell, no self-fetched web content (both were possible failure modes before the `subagent` preset-state fix and the `bash` removal).
- All 7 workers inherited the orchestrator's model, artifacts landed in `sources/`, `screenshots/`, `reports/`, and the trace manifest made every claim in this report checkable in minutes.
- Worker *replies* were concise; context bloat did not come from worker returns.

## Failure 1: a dead collector was reported as a success

**Evidence.** Collector #1 was assigned the one source that actually answers the task: the official Oregon SOS February 2026 registration PDF. It downloaded the PDF fine (`curl` + `pdftotext` after the browser triggered a download), then ran `cat` on the entire extracted text, pulling a full county-by-county number table into its own context. On the next turn it hit the output-token ceiling: `stopReason: "length"`, empty final reply, **no source file written**.

The orchestrator was then told **"Parallel: 4/4 succeeded"**. `isErrorResult()` in `extensions/tools/workflow-orchestrator.ts` treats only nonzero exit / `error` / `aborted` stops as failure — a `length` stop with an empty reply counts as success.

**Consequence.** The draft was synthesized from the surviving secondary sources: an undated Independent Voter Project stats page (3,386,962 total, "44% independent" — inconsistent with current SOS data), a 2021 PSU report about 2018 turnout, and a generic Ballotpedia page. A 2026 question answered with stale, unverifiable numbers, confidently cited. The report *looks* good; the grounding is not.

**Fix (harness, code — shipped).** In `isErrorResult`, treat `stopReason === "length"` — and an empty final reply — as an error return. This matches the contract the orchestrator prompt already states: "Nonzero exit, blocker text, missing artifact, or failed validation is an error return." With a truthful `3/4 succeeded`, the orchestrator can note or retry the failed URL, per the program.

## Failure 2: the orchestrator bloats its own context

**Evidence** (orchestrator session, input tokens per turn): context grew 4.4k → 14.1k across the run. The growth was self-inflicted:

- It `read` **all three source files in full before drafting** — the program never asks for this; Phase 4 has the `write` worker read `sources/*.md`.
- It `read` `reports/report.md` **three times** (after draft, after editorial, after its own edit). Phase 6 asks for one grounded-validation read.
- It `ls`'d `sources/` twice back-to-back.
- It hand-`edit`ed the report's Sources section itself instead of delegating the repair pass to `write`, as Phase 6 specifies.

14k tokens is survivable for a frontier model; for a 26B local model it is exactly the "cluttering your own context" the orchestrator prompt forbids, and it degrades the decisions the orchestrator exists to make (it never noticed that 4 collectors produced 3 source files, despite listing the directory twice).

**Fixes (preset prompt, `agents/workflow.yml`):**

- Add an explicit context-discipline rule: never read artifacts a worker is about to consume; never re-read a file already in context; use `ls`/`find` for existence checks, full `read` only where the workflow names a validation gate — and read once.
- Artifact ownership rule: report/source content belongs to workers; the orchestrator's `write`/`edit` are for workflow state notes, not artifact repair. Repair passes are delegated.

**Fix to consider (preset tools).** We removed `bash` from the orchestrator for exactly this class of failure; the self-edit suggests `write`/`edit` invite the same boundary violation. Options: (a) remove `write`/`edit` too, leaving the orchestrator read-only plus `subagent`/`questionnaire`; or (b) keep them with the prompt rule above. Leaning (a) — nothing in the shipped workflow programs requires the orchestrator to write files — but this changes the preset contract, so it should be its own decision. (See also proposals.md's on-disk instruction-pointer idea, which would need (b).)

## Failure 3: no artifact validation gate between collection and drafting

**Evidence.** Four collectors dispatched, three source files on disk, orchestrator proceeded to draft without comment. The program says "Continue the workflow if one collector fails, but note failed URLs" — nothing was noted, because Failure 1 hid the error and no independent check existed.

**Fix (program, `shared/prompts/workflow/deepresearch.md`).** After parallel collection, add a validation gate: one `sources/*.md` must exist per dispatched collector (a single `ls` satisfies this); on a gap, re-dispatch that collector once or record the missing URL as a noted failure before drafting.

## Failure 4: collectors mishandle document-sized sources

**Evidence.** Two collectors downloaded PDFs. Collector #1 `cat`'ed the full extracted text into context and died on token length. Collector #4 succeeded but littered the workspace root with `report.pdf` and `report.txt` (its intermediates for the PSU PDF, confusingly named).

**Fix (program, collector contract in `deepresearch.md`).**

- Extract documents directly to files (`pdftotext file.pdf sources/<slug>.txt`), then read *bounded excerpts* to build the source markdown. Never `cat` an entire document into context.
- Keep downloads and intermediates under `sources/` (e.g. `sources/<slug>.pdf`), never the workspace root, and never named `report.*`.

## Fix priority

1. ~~`isErrorResult` length/empty-reply handling~~ — **shipped**: length stops and empty final replies now count as failures, and failure lines include the reason (exit code, output-token limit, aborted, empty reply).
2. Collection validation gate in deepresearch (prompt).
3. Collector PDF/document handling in deepresearch (prompt).
4. Orchestrator context-discipline rules in workflow.yml (prompt).
5. Decide on removing `write`/`edit` from the workflow preset (design decision).

Items 2–4 are testable with the same bench task; re-run and diff trace manifests (`bench workflow deepresearch --task 1`, then compare `workspace/.pi/subagent-traces/*/manifest.json` and the orchestrator session token growth against the reference run above).
