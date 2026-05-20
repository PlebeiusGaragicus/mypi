#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPresetSource, validatePresetRegistry } from "../shared/presets/runtime.mjs";

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const registry = loadPresetSource(root);
const { errors, warnings } = validatePresetRegistry({ packageRoot: root, registry, packageJson });

for (const warning of warnings) {
	console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`error: ${error}`);
	}
	process.exit(1);
}

console.log(`Checked ${registry.size} preset files.`);
