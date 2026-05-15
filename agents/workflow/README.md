# mas

Top-level multi-agent orchestrator for reusable capability agents.

Unlike workflow-specific MAS configs that own a nested worker pool, `mas` delegates to a fixed set of durable top-level agents:

- `ask` - chat-only reasoning, classification, critique, and PASS/FAIL checks.
- `scout` - read-only directory and repository exploration.
- `writer` - documentation, prose editing, reports, and other text artifacts.
- `coder` - implementation, tests, builds, and command execution.
- `web` - live web search, browser-control, source extraction, and citation-backed synthesis.

Workflow prompts in `prompts/` define task-specific orchestration. For example, `/deepresearch` can ask `web` to find and inspect sources, `writer` to create a report, and `ask` with the `judge` persona to validate quality gates. `/pdf-ocr` drives PDF ingestion, per-page OCR via `coder`, optional assembly via `writer`, and URL fetch via `web` when needed; page renders go under `pages-png/` and transcripts under `pages-ocr/`. `/kid-story` runs three parallel `writer` brainstorm lanes into `ideas/brainstorm-*.md`, then one `writer` narrator merges them into `story.md` (≤500 words). `/retro` uses one cwd-scoped `scout` pass and read-only `coder` to review a **`/name`d** session, correlating **`sessions/<cwd-key>/`** to **`subagent-traces/<run-id>/`** via the **`dotpi.subagent-traces`** session **`custom`** entry in the orchestrator JSONL. `/workflow-builder` creates or revises user workflows in **`$DOT_PI_OVERLAY/mas/prompts/`** by default (durable across `pi update`) or in **`.pi/prompts/`** when the user chooses project-only storage; it never writes bundled prompts under the git package tree. The workers remain general-purpose capability agents.

Worker traces (JSONL plus `manifest.json`) are grouped under **`$DOT_PI_OVERLAY/mas/subagent-traces/<run-id>/`** (default **`~/.pi/dot-pi/mas/subagent-traces/...`**) so they survive **`pi update`** on the package clone. The orchestrator session file records the bundle path on first **`subagent`** delegation (**`dotpi.subagent-traces`** **`custom`** entry). User-resumable `mas` sessions stay under **`$DOT_PI_OVERLAY/mas/sessions/`** (see dispatch-agent).
