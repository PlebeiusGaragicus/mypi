# Deep Research Workflow

Use top-level capability agents to produce a citation-backed research artifact. This workflow must match the quality bar of the legacy `deepresearch` MAS: source scouting, one-source-per-collector capture, draft synthesis, editorial review, and grounded final validation.

## Goal

Create a focused research report from live sources. The output must be auditable from local artifacts, not merely summarized from worker replies. Prefer a saved artifact over a long chat answer unless the user explicitly asks for an inline summary.

## Required Trajectory

Follow these phases in order. Do not skip phases unless the workflow stops with a blocker.

### 1. Preflight

- Derive the research topic and constraints from the user request at the end of this prompt.
- If the user request is too ambiguous to research responsibly, use `questionnaire` once to ask for the missing topic or constraints before invoking workers.
- After workers have been invoked, do not use `questionnaire` unless this workflow explicitly reaches a user-decision checkpoint. Stop with a concise blocker instead.
- Create or instruct workers to create these directories as needed: `sources/`, `screenshots/`, and `reports/`.

### 2. Source Scout

Call `web` once as a source scout.

The scout task must ask `web` to:

- Search for authoritative, diverse, high-signal sources for the user's research request.
- Return a numbered source list with title, URL, source type, relevance note, and any known access risk.
- Include search queries used, gaps, and suggested follow-up searches.
- Avoid writing the report or summarizing the whole topic.
- Return enough structured detail for you to parse one collector task per URL.

If the scout reports repeated empty results, missing provider keys, rate limits, or provider errors, stop and report the issue to the user.

### 3. Parallel Source Collection

Parse the scout's numbered source list. Dispatch `web` in parallel `tasks[]`, one collector task per URL, with a unique collector number. Keep each parallel batch to at most 10 tasks.

Each collector task must include this contract:

```text
Collector #<n>: Fetch and clean this source.
- URL: <url>
- Title: <title>
- Relevance: <why this source matters>

Create:
- sources/<slug>.md with YAML frontmatter:
  url: <url>
  title: <title>
  date_fetched: <ISO timestamp if available>
  screenshot: screenshots/<slug>.png or null
- screenshots/<slug>.png when browser-control can render the page.
- On `CHALLENGE_DETECTED` from `$B`, run handoff, notify the user, and resume only after the challenge is cleared.

The source file must contain cleaned main content, important quotations or facts, and a short source summary. Preserve URLs. If access fails, do not invent content; save a screenshot or issue note when useful and return the failure clearly.

Return a concise collection confirmation with source path, screenshot path if any, title, URL, summary, approximate content captured, and issues encountered.
```

Continue the workflow if one collector fails, but note failed URLs. Stop only if too few sources were collected to support a useful report.

### 4. Draft Report

Call `write` once to draft the report.

The write task must ask it to:

- Read all `sources/*.md` files.
- Write the report to `reports/report.md` unless the user requested another path.
- Use inline numbered citations such as `[1]` for factual claims.
- Include a `Sources` section mapping citation numbers to source titles, URLs, and screenshot paths.
- Preserve uncertainty and report access failures or source gaps.
- Return a `### Draft Written` confirmation with report path, source count, section count, and notes for editorial review.

### 5. Editorial Review

Call `write` a second time as an editor.

The editor task must ask it to:

- Read `reports/report.md` and all `sources/*.md` files.
- Verify that important factual claims have inline citations.
- Verify that citation numbers map to URLs in the `Sources` section.
- Verify screenshot paths that appear in the report.
- Correct unsupported claims, missing citations, weak structure, and broken source references.
- Save the final polished report back to `reports/report.md`.
- Return a `### Editorial Review` confirmation with changes made, source coverage, remaining gaps, and whether the report is ready.

### 6. Grounded Validation

Before final reply, use your own read tool to inspect `reports/report.md`. Do not ask `chat` to read file paths; `chat` has no tools.

If you use `chat` with persona `judge`, pass it the actual report excerpt, source list, or checklist text inline. The task must not contain path-only instructions such as "evaluate `reports/report.md`." Use `chat` only for semantic judgement over text you provide.

If validation fails, run one repair pass with `write` or `web` depending on the failure reason, then inspect the report again. If it still fails, stop and report the blocker with partial artifact paths.

## Artifact Conventions

- `sources/` for one markdown file per collected source.
- `screenshots/` for browser evidence and access-failure receipts.
- `reports/report.md` for the final report unless the user specifies another path.
- `drafts/` for intermediate writing only when useful.

## Stop Conditions

- Stop early if search providers, browser-control, or source access fail in a way that blocks the research.
- Stop early if the topic is too ambiguous to research without a user choice; return a concise clarification need instead of guessing.
- Do not ask workers to write files unless their structural permissions allow it and the task explicitly needs an artifact.
- Do not accept a report without inline citations and a source appendix.

## Final Response

Keep the final response short. Prefer:

`Research completed. Report saved to ./reports/report.md.`

If the workflow stopped early, mention the blocker and any partial artifact paths. Do not paste the full report into chat unless the user requested it.

## User Request

Treat the text below as the user's research request, including topic, constraints, desired output path, source preferences, and any scope limits. If no request was provided, or if it is too ambiguous to research responsibly, ask the user for the missing topic or constraints before continuing.

**User prompt:**
`$@`
