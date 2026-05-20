# mypi runtime env

mypi-owned runtime values live in `~/.pi/mypi/mypi.env` by default. Set `MYPI_ENV_FILE` to override the path.

`mypi.env.example` at the package root is the schema and default source. Empty values are intentionally treated as unset, so skills can fail before making network calls and tell the user which key is missing.

## Commands

- `/mypi-env-config` opens an interactive editor.
- `/mypi-env-config path` shows the active file path.
- `/mypi-env-config list` shows configured keys.
- `/mypi-env-config get KEY` shows one value.
- `/mypi-env-config set KEY VALUE` persists one value.
- `/mypi-env-config unset KEY` writes the key as empty.
- `/mypi-env-config init` creates the file from `mypi.env.example`.
