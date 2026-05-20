# Validation

The quality workflow runs checks for browser runtime behavior, changelog shape, preset configuration, and runtime env behavior.

## Presets

```sh
npm run presets:check
npm run presets:test
```

`presets:check` validates flat `agents/*.yml` layout, preset fields, tool names, extensions, workers, themes, environment keys, and package references.

`presets:test` exercises shared preset runtime behavior such as merging, prompt composition, effective tools, and workflow clean-session detection.

## Runtime Env

```sh
npm run runtime-env:test
```

This verifies lazy file creation, dotenv parsing, empty-value behavior, process env application, and shell export formatting.

## Browser Runtime

```sh
npm run browser:test
npm run browser:build
```

These run inside `utilities/browser-runtime`.
