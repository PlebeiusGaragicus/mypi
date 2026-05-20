# mypi Documentation

This directory is the living spec for the current mypi package. It describes how presets, tools, skills, prompts, runtime environment, workflows, and UI extensions work today.

## User And Operator Guides

- [Presets](presets.md): selecting presets with `/preset` and `pi --preset`, clean-session rules, and runtime behavior.
- [Preset Catalog](preset-catalog.md): shipped presets and their intended use.
- [Custom Presets](custom-presets.md): user/project overlays and merge rules.
- [Runtime Env](runtime-env.md): `~/.pi/mypi/mypi.env`, `/mypi-env-config`, and shell bootstrap.
- [Commands](commands.md): slash commands and package npm scripts.
- [Workflow Library](workflow-library.md): workflow prompt catalog and invocation examples.
- [Bootstrap](bootstrap.md): PATH promotion, `$B`, and dev-shell setup.
- [Validation](validation.md): checks that keep presets and runtime env healthy.

## Feature Specs

- [Agent Presets](agent-presets.md): YAML schema, prompt composition, tool activation, resource discovery, and overlay semantics.
- [Workflow Orchestrator](workflow-orchestrator.md): `subagent`, worker presets, trace behavior, and workflow preset rules.
- [Workflow Builder](workflow-builder.md): conventions for authoring workflow prompts.
- [Skill Builder](skill-builder.md): conventions for creating and reviewing Pi skills.
- [Browser Control](browser-control.md): browser automation runtime, `$B`, and safety requirements.
- [Branding](branding.md): global UI and quality-of-life extensions.
- [Development Process](development-process.md): durable issue/PR/changelog/review process.

## Runtime State

mypi-owned runtime values live in `~/.pi/mypi/mypi.env`. Pi model credentials remain in Pi's own auth store, not in mypi docs or config.

