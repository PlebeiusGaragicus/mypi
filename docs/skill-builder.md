# Skill Builder

## Purpose

Create a `skill-builder` skill that helps agents create, review, and enhance Pi skills consistently.

The builder should treat a skill as a whole folder, not just a `SKILL.md` file. When building or modifying a skill, the agent should inspect the folder inventory, update documentation and implementation together, and preserve invocation conventions for future agents and humans.

## Skill Locations

The builder must distinguish Pi-native skill locations from mypi preset-scoped skill resources.

Pi-native global skills:

```text
~/.pi/agent/skills/<skill-name>/
~/.agents/skills/<skill-name>/
```

Pi-native project skills:

```text
.pi/skills/<skill-name>/
.agents/skills/<skill-name>/
```

mypi shared skills in this repository:

```text
shared/skills/<skill-name>/
```

Presets do not own skill directories. A preset that needs skills references existing locations via `skillDirs`, such as:

```yaml
skillDirs:
  - shared/skills/arxiv-search
  - .pi/skills/project-skill
```

Repo-local conventions for `shared/skills` are the reference style for this project. The builder should not assume every Pi installation has the same shared-skill path or path-promotion registry.

## Skill Directory Model

A skill is a directory with a required `SKILL.md` and optional supporting files:

```text
<skill-name>/
├── SKILL.md
├── scripts/
├── assets/
├── resources/
├── examples.md
└── reference.md
```

Generated files, caches, and local runtime state should not be documented as part of the skill inventory. Examples include `__pycache__`, `.DS_Store`, build outputs, and transient logs.

## Frontmatter

Every `SKILL.md` should include concise YAML frontmatter:

```yaml
---
name: skill-name
description: Specific discovery text explaining what the skill does and when to use it.
disable-model-invocation: true
---
```

The `description` helps the agent decide whether to load the skill. It should not carry detailed usage instructions, path-promotion notes, bootstrap details, command syntax, or implementation inventory. Those belong in the markdown body after the skill is loaded.

Decision rule for `disable-model-invocation`:

- Use `false` when the skill is part of an agent preset's expected autonomous behavior and should be visible in the generated skills list.
- Use `true` when the skill is command-only, experimental, or should be used only after explicit user/agent invocation.

The builder should ask which behavior is intended. Any workflow or agent preset that expects the agent to discover and act out the skill should set:

```yaml
disable-model-invocation: false
```

## Invocation Patterns

The builder should classify each skill's executable surface and document exactly how the agent invokes it.

Common patterns:

- **Path-promoted command:** the skill's `scripts/` directory is added to `PATH`; call the command by basename.
- **Environment-backed command:** an environment variable points to the executable, such as browser-control using `$B`.
- **Explicit script path:** call a script via a relative path from the skill or project root.
- **External service/API:** use documented HTTP/API calls or MCP tools.
- **No tooling:** the skill is pure instruction/reference material.

Do not mention path-promotion in the frontmatter description. If a skill is path-promoted, include a terse body note near the top:

```markdown
This skill is **path-promoted**: the `scripts/` directory is on your **PATH**. Run **`<command>`** by basename, not by path into this skill folder.
```

For this repo's shared skills, path promotion is controlled by:

```text
scripts/path-promoted-skills.txt
```

Only use the path-promoted note when the skill is actually listed in the relevant promotion registry. Some skills use other bootstrap mechanisms instead.

## Environment Files And Runtime State

Skill docs should be explicit about environment variables they depend on, but should not require secrets or generated local state to live inside the skill directory.

Guidance:

- Scripts should usually "just work" without the agent reasoning about environment variables.
- Keep secrets and runtime settings in `~/.pi/mypi/mypi.env`, provider-specific auth stores, or user shell environment, not in the skill folder.
- Use package `mypi.env.example` as the definitive list of mypi-managed environment variables.
- Do not create per-skill or per-preset `env` files.
- Do not include runtime state, cache files, browser sessions, logs, or generated outputs in the skill inventory.
- For mypi package scripts, prefer package-level bootstrap helpers over per-skill shell sourcing.
- Do not inject env var values into system prompts.
- Avoid mentioning env vars in `SKILL.md` unless the agent must know them to invoke the skill correctly. Example: browser-control must document `$B` because `$B` is the invocation surface.
- Scripts must fail informatively when required env vars are missing. The script error should tell the agent which variable is missing and instruct it to block for human assistance or use `/mypi-env-config`.

## Inventory Requirement

Every skill should be self-documenting. `SKILL.md` should include an inventory that lets an agent understand folder contents without first listing the directory.

Small skills should show the full tree. Large skills may list top-level directories and public entrypoints instead of every file.

Inventories are maintained manually and can drift. The builder must inspect the whole skill folder before edits and update the inventory as part of any skill enhancement.

## Authoring Workflow

When creating a skill:

1. Clarify purpose, target location, trigger scenarios, expected outputs, and whether tooling is needed.
2. Clarify whether the skill should be prompt-visible for agent presets or explicit-invocation only.
3. Choose a lowercase hyphenated skill name.
4. Create the folder model around `SKILL.md` plus any scripts, assets, resources, examples, or references.
5. Write concise discovery-focused frontmatter.
6. Document invocation pattern and inventory in the body.
7. Add examples only when they improve future execution.
8. Verify that all referenced files and commands exist.

When enhancing an existing skill:

1. Inspect `SKILL.md` and the whole skill directory before editing.
2. Identify the current invocation pattern.
3. Update implementation and documentation together.
4. Refresh the inventory.
5. Remove stale command examples or references.
6. Keep `SKILL.md` concise; move detailed material to one-level-deep references when needed.

## Runtime Behavior For Malformed Skills

Passive discovery should not be noisy. Malformed or incomplete skill folders found during broad scans should not block normal Pi sessions.

Explicit paths are different. If a preset YAML lists a `skillDirs` entry or explicit skill path, missing or malformed resources should produce a warning because the user intentionally requested that resource.

During explicit skill development or review, the builder may mention malformed skill folders when they are in scope. It should not treat unrelated incomplete folders as blockers.

## Review Checklist

- `SKILL.md` exists and has valid frontmatter.
- `name` is lowercase, hyphenated, and matches the folder unless there is a deliberate reason.
- `description` is concise discovery text, not usage documentation.
- `disable-model-invocation` matches the intended prompt-visible vs explicit-only behavior.
- Invocation pattern is explicit and accurate.
- Path-promotion notes appear only in the body and only for promoted skills.
- Directory inventory exists and excludes generated files.
- Documented commands, scripts, assets, and references exist.
- Script examples use the intended invocation form.
- Supporting files are linked directly from `SKILL.md`, not through deep reference chains.
- `SKILL.md` is concise enough to load comfortably.

## Current Code/Spec Conflicts

- The earlier draft referenced `./.pi/agent/skills/<skill-name>/`, but Pi project skills are `.pi/skills/`, not `.pi/agent/skills/`.
- The preset refactor does not add preset-owned skill directories. Presets reference existing skill directories such as `shared/skills/<skill-name>/` or `.pi/skills/<skill-name>/`.
- Existing repo skills mix `disable-model-invocation: true` and `false`; the builder must choose intentionally rather than default blindly.
- `browser-control` uses the package preset bootstrap for `$B`; web-capable presets include the shared skill explicitly.

## Open Implementation Feedback

- Decide whether personal/project Pi skills can be path-promoted and where that registry lives.
- Decide whether `skill-builder` should include validation helper scripts or stay purely instructional.
- Decide whether shared skills should follow one exact section order or allow small variations by skill type.

