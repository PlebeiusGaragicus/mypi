# Kid Story — toy parallel brainstorm → narrator

Demonstration workflow: three **`write`** brainstorm passes run in parallel into **`ideas/`** markdown files, then one **`write`** narrator reads them and writes a single short children's story to **`story.md`**. Intended as a small workflow-orchestrator handoff demo, not a production editorial pipeline.

## Program Contract

- Inputs: idea seed, audience, tone, guardrails, optional title/output path, and word cap.
- Outputs: three brainstorm files, one `story.md` artifact, and a concise final response pointing to them.
- State: `ideas/brainstorm-*.md`, `story.md`, worker returns, word-count check.
- Invariants: parallel brainstorm workers do not collide on paths; narrator writes the story; final story body stays within the word cap.
- Stop conditions: missing seed, fewer than two brainstorm artifacts after repair, or failed story/trim pass.

## Execution Graph

1. Preflight parses the seed and settings.
2. Parallel `write` calls produce three brainstorm files.
3. A narrator `write` call synthesizes `story.md`.
4. The orchestrator checks length and optionally calls one trim pass.
5. Final output reports artifact paths and any partial lanes.

## Goal

From user-supplied **settings** (audience, tone, any guardrails) and an **idea seed**, produce:

- Three separate brainstorm artifacts under **`ideas/`** (one file per parallel worker, fixed names below).
- One finished **`story.md`** that weaves those ideas together.

The story must stay **at or under 500 words** (hard cap). Prefer saving artifacts in the current working directory over pasting the full story in chat unless the user asks for it inline.

## Required Trajectory

Follow these phases in order. Do not skip validation unless the workflow stops with a blocker.

### 1. Preflight

- Parse the user request at the end of this prompt for:
  - **Idea seed** — premise, creature, setting hook, or “what happens” hint (required to start).
  - **Settings** — target age or reading level, tone (playful, cozy, adventurous, etc.), perspective (first/third), any topics to avoid, optional title hint, and whether the user wants an alternate output basename (default **`story.md`**).
  - **Word cap** — default **500** words maximum for the final story body.
- If the idea seed is missing or too vague to assign three distinct brainstorm lanes, use **`questionnaire`** once to collect it before invoking workers.
- After workers have been invoked, do not use **`questionnaire`** except where this workflow explicitly requires a user decision.
- Ensure workers will not collide on paths: each parallel task writes **exactly one** of the three files listed in §2.

### 2. Parallel brainstorm (`write` × 3)

Call **`subagent`** once in **parallel** mode with **`tasks[]`** length **3**, each entry **`agent: write`**.

Embed the user's **settings** and **idea seed** verbatim inside **each** of the three task strings (do not rely on workers reading this template).

Use these **fixed paths** and **lanes**:

1. **`ideas/brainstorm-characters.md`** — voices, relationships, names, dialogue flavor, what makes a child care about the cast.
2. **`ideas/brainstorm-setting.md`** — where/when, sensory details, one or two memorable “story world” rules.
3. **`ideas/brainstorm-plot.md`** — beginning/middle/end beats, obstacle, resolution shape, one optional funny or surprising twist.

Each parallel task must require:

- YAML frontmatter with at least: **`lane`**, **`audience`**, **`tone`**, **`seed_summary`** (short echo of the seed).
- A **bullet list** of **8–15** concrete brainstorm bullets (not prose story text).
- Save **only** that worker's file; do not write **`story.md`** in this phase.
- Return a short confirmation with the path written.

If one parallel **`write`** fails, continue if at least **two** brainstorm files exist; otherwise stop and report which paths are missing. Note partial coverage in the final response.

### 3. Narrator pass (`write` × 1)

Call **`write`** once as narrator.

The narrator task must:

- Read every existing file among:
  - **`ideas/brainstorm-characters.md`**
  - **`ideas/brainstorm-setting.md`**
  - **`ideas/brainstorm-plot.md`**
- Synthesize **one** cohesive children's story that respects the user **settings** and **seed**, using the brainstorm files as raw material (not quoted verbatim as a list in the final story).
- Write to **`story.md`** in the current working directory (or the user-requested path from preflight, if they gave one).
- Enforce **≤ 500 words** in the story body (exclude YAML frontmatter if any; story proper is markdown narrative).
- Keep language kind, non-graphic, and age-appropriate to the stated audience.
- Return **`### Story written`** with path, approximate word count, and one line on which brainstorm lanes were incorporated.

### 4. Length check and optional trim

Use your own **`read`** tool on **`story.md`**. Approximate a word count on the narrative.

- If the body is **≤ 520 words**, treat as acceptable (small counting slack).
- If clearly **over 520 words**, call **`write`** once more with a tight trim task: read **`story.md`**, rewrite in place preserving plot and voice, **≤ 500 words**, same path.

Do not ask **`judge`** to read **`story.md`** from a path alone. If you use the **`judge`** preset for a child-appropriateness sniff test, paste an **inline excerpt** only (for example opening plus closing paragraphs), not path-only instructions.

## Artifact Conventions

- **`ideas/brainstorm-characters.md`**, **`ideas/brainstorm-setting.md`**, **`ideas/brainstorm-plot.md`** — parallel brainstorm inputs; safe to delete after a successful run if the user wants a minimal tree.
- **`story.md`** — final children's story (default location).

## Stop Conditions

- Missing idea seed after **`questionnaire`**.
- Fewer than two brainstorm files exist after the parallel phase and a single targeted **`write`** retry cannot restore coverage.
- **`write`** cannot produce **`story.md`** or trim pass fails twice — stop with paths and blockers.

## Final Output

The final response is the program output. Keep it short and point to artifacts on disk. Prefer:

`Kid story demo complete. Brainstorm: ./ideas/brainstorm-*.md — Final: ./story.md (≤1,000 words).`

Mention any failed parallel lane or trim pass. Do not paste the full story unless the user requested it.

## User Request

Treat the text below as the user's **settings**, **idea seed**, optional **output path** for the story, and any constraints (age, tone, topics to avoid, word cap).

**User prompt:**
`$@`
