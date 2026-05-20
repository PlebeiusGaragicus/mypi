# Commands

## Presets

- `/preset`: choose a preset from a menu.
- `/preset <name>`: activate a preset.
- `/preset pi`: disable mypi preset state and return to vanilla Pi.

## Runtime Env

- `/mypi-env-config`: interactively edit `mypi.env`.
- `/mypi-env-config path`: show the active file path.
- `/mypi-env-config list`: show known keys.
- `/mypi-env-config get KEY`: show one value.
- `/mypi-env-config set KEY VALUE`: persist one value.
- `/mypi-env-config unset KEY`: set one value to empty.
- `/mypi-env-config init`: create the file from `mypi.env.example`.

## Branding And Convenience

- `/save`: save the latest assistant reply.
- `/say`: speak the latest assistant reply.
- `/stop-speaking`: stop speech.
- `/tts-toggle`: toggle automatic TTS for the current session.
- `/tts-wpm`: view or set `SAY_TTS_WPM`.
- `/flow-title`: enable mypi title behavior.
- `/flow-title-builtin`: restore built-in title behavior.

## Package Scripts

- `npm run presets:check`
- `npm run presets:test`
- `npm run runtime-env:test`
- `npm run browser:install`
- `npm run browser:build`
- `npm run browser:test`
- `npm run browser:dev`
