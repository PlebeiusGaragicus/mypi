# Branding

Branding is a package-level extension group under `extensions/mypi-branding`. It is always loaded by the package and does not require preset opt-in.

## Responsibilities

- Header/title/status presentation.
- Theme cycling helpers.
- `/save` for saving the latest assistant reply.
- `/say`, `/stop-speaking`, `/tts-toggle`, and `/tts-wpm` for local speech.
- Run timing and finish notifications.

## Runtime Env

TTS speed persists in `~/.pi/mypi/mypi.env` as:

```text
SAY_TTS_WPM=300
```

Users can edit it with `/tts-wpm` or `/mypi-env-config`.

## Preset Awareness

Branding may read active preset state for display, but it is intentionally not gated by preset `extensions:`. Presets can select a theme by name; themes are installed at the package level.

## Color Support

`extensions/mypi-branding/branding-color-support.ts` handles terminal color-depth differences, including conservative behavior for older macOS Terminal combinations.
