# Custom Presets

Custom presets and overlays use the same YAML schema as package presets.

## User Overlay

Use user-wide overlays for preferences that should apply across projects:

```text
~/.pi/mypi/agents/<preset>.yml
```

## Project Overlay

Use project overlays for repository-specific behavior:

```text
.pi/mypi/agents/<preset>.yml
```

mypi walks from the current directory up to the home directory and loads every `.pi/mypi` source root it finds. Deeper project overlays win for scalar fields.

## Merge Guidance

Overlay scalar fields only when you want to replace the package value. Lists such as `skillDirs`, `promptFiles`, `promptDirs`, `includeTools`, `extensions`, and `workers` accumulate.

If you need a more restrictive variant of an existing preset, create a new preset name rather than trying to subtract capabilities from an existing one.

## Example

```yaml
description: Code preset with project-specific prompts
promptFiles:
  - .pi/prompts/project-rules.md
environment:
  PROJECT_API_BASE: https://example.test
```
