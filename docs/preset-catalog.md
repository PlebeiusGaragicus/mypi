# Preset Catalog

The package ships these presets under `agents/*.yml`.

| Preset | Purpose |
| --- | --- |
| `chat` | General conversation without tools. |
| `direct` | Minimal direct interaction profile. |
| `scout` | Read-only repository and directory discovery. |
| `write` | Prose and documentation edits without shell access. |
| `code` | Code implementation, tests, builds, and command execution. |
| `web` | Web research, browser automation, screenshots, and source extraction. |
| `workflow` | Multi-agent orchestration through `subagent` and `questionnaire`. |
| `classifier` | Strict classification worker. |
| `judge` | Evaluation and critique worker. |
| `human` | Human-facing response and handoff style. |
| `plato` | Philosophical dialogue profile. |

Use `/preset` to select user-facing presets. Internal or specialized presets can set `userSelectable: false` while remaining available to explicit `/preset <name>` and workflow workers.
