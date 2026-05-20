# Bootstrap

mypi has package-level bootstrap for Pi sessions and dev shells.

## Pi Sessions

`extensions/preset/index.ts` imports `extensions/preset/bootstrap.ts`. Bootstrap performs three tasks:

- load non-empty values from `~/.pi/mypi/mypi.env` into `process.env`
- prepend promoted skill script directories to `PATH`
- set `$B` to the browser runtime when it is built

Child shell tools inherit this environment.

## Dev Shells

For normal shells outside Pi:

```sh
source scripts/bootstrap.sh
```

This reads `scripts/path-promoted-skills.txt`, prepends promoted skill scripts to `PATH`, and exports non-empty runtime env values.

## Path Promotion

`scripts/path-promoted-skills.txt` contains one skill folder name per line under `shared/skills/<name>/`. Only skills listed there should tell agents to run scripts by basename.
