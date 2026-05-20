# mypi Branding

## Purpose

`mypi-branding` contains global UI and quality-of-life extensions for the mypi package.

Current bundle behavior includes:

- Flow title/header.
- Rainbow editor.
- Window title.
- Run timer.
- Tokens-per-second display.
- Run-finish notifications.
- `/save`.
- Text-to-speech `/say`.
- System prompt debug view.
- Theme cycling.

## Preset Relationship

Branding is intentionally different from preset-aware capability extensions.

Default behavior:

- Branding loads globally with the package.
- Branding does not need to appear in preset `extensions:` lists.
- Branding may read active preset state for display, but it should not be activated or deactivated by presets by default.

Examples:

- A status line can show the active preset.
- Workflow presets can show a simple header/title reading `MULTI-AGENT SYSTEM`.
- Theme cycling can include package/global/project themes.
- System prompt debug can display the effective preset-composed prompt.

## Current Code

The bundle entry point is:

```text
extensions/mypi-branding/index.ts
```

It currently composes the branding modules directly and is listed in `package.json` under `pi.extensions`.

## Current Code/Spec Conflicts

- Minimal conflict: branding is already package-level and largely independent of agent mode.
- Theme behavior may need to coordinate with preset-selected `theme`.
- System prompt debug should understand preset-composed prompts after the refactor.
- Existing per-feature config files such as a TTS WPM file should migrate to `~/.pi/mypi/mypi.env` when they are simple user configuration values.
- Workflow branding should be limited to a simple `MULTI-AGENT SYSTEM` header/title.

## Decisions

- Keep branding package-global.
- Do not require preset `extensions:` opt-in for branding.
- Allow branding to consume active preset state when useful for UI.
- When the active preset is a workflow preset, show `MULTI-AGENT SYSTEM` in the header/title.
- Install shared themes at package level; presets select `theme` by name rather than exposing theme directories.
- Use mypi environment config for simple user-tunable values consumed by branding extensions, such as TTS settings.

## Open Implementation Feedback

- Decide whether theme cycling should cycle all loaded themes or prioritize package shared themes.
- Verify `/save` and `/say` remain appropriate as global commands.
- Define the env keys used by branding in `mypi.env.example`.

