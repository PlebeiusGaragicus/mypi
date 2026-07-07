# Branding

Branding is a package-level extension group under `extensions/mypi-branding`. It is always loaded by the package and does not require preset opt-in.

## Responsibilities

- Session header (MYPI figlet) when a preset is active; subtitle shows `preset · project-dir`. Vanilla Pi (`/preset pi` or no preset) uses pi's built-in header.
- Window title and status presentation.
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

The MYPI session header is shown only while a mypi preset is active. Other branding (theme hotkey, TTS, run timer, and so on) stays available without preset opt-in. Presets can select a theme by name; themes are installed at the package level.

## Color Support

`extensions/mypi-branding/branding-color-support.ts` handles terminal color-depth differences for the session header:

- **Intel Mac + Terminal.app** (`darwin`, `x64`, Terminal session): 256-color only.
- **Apple Silicon macOS**: always truecolor (Node often reports a low `getColorDepth()` in Terminal.app; mypi does not downgrade).
- **Other systems**: truecolor when `getColorDepth() >= 24`, else 256-color.

Overrides: `MYPI_BRANDING_TRUECOLOR=0` forces 256-color, `=1` forces 24-bit.
