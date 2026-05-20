# Runtime Env

mypi runtime values live in:

```text
~/.pi/mypi/mypi.env
```

Set `MYPI_ENV_FILE` to use a different file.

## Template

`mypi.env.example` is the schema and default source. Empty values are intentional and are treated as unset by bootstrap and scripts.

## Editor

Use `/mypi-env-config`:

```text
/mypi-env-config
/mypi-env-config path
/mypi-env-config list
/mypi-env-config get EXA_API_KEY
/mypi-env-config set SAY_TTS_WPM 300
/mypi-env-config unset EXA_API_KEY
/mypi-env-config init
```

The file is created lazily from `mypi.env.example` when runtime-env first needs it.

## Bootstrap

Pi sessions load non-empty values into `process.env` from `extensions/preset/bootstrap.ts`. Dev shells can source `scripts/bootstrap.sh` to get the same exports.

Existing shell values win. File values only fill unset or empty keys.
