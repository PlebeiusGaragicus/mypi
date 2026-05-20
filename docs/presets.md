# Presets

Presets are named agent profiles. Use them interactively with `/preset` or at process start with `pi --preset <name>`.

## Commands

```text
/preset
/preset code
/preset pi
pi --preset web
```

`/preset` opens a selectable list. `/preset pi` returns to vanilla Pi behavior by disabling mypi preset state.

## Restore

mypi persists the selected preset in the session as `mypi-preset-state`. On resume, the preset extension restores the last preset unless a `--preset` flag overrides it.

## Workflow Presets

Workflow presets use `subagent` and should start from a clean session. If a workflow preset is restored into a branch with prior user messages, mypi clears the preset state and asks the user to run `/new`, then select the workflow preset again.

## Model, Thinking, Theme

Presets may set `provider`, `model`, `thinkingLevel`, and `theme`. When the active Pi build exposes those controls to extensions, mypi applies them on activation and warns if it cannot.

## Resources

Preset resources are discovered from `skillDirs`, `promptFiles`, and `promptDirs`. Resources update after preset changes by reloading the session.
