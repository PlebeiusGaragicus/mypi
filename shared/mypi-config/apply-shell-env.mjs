#!/usr/bin/env node
/**
 * Prints shell export statements for non-empty mypi.json env keys not already set.
 * Usage: eval "$(node shared/mypi-config/apply-shell-env.mjs)"
 */
import { readConfig } from "./read.js";
import { resolveConfigPath } from "./paths.js";

const config = readConfig();
const shell = process.env.SHELL ?? "";
const useFish = shell.includes("fish");

for (const [key, value] of Object.entries(config.env ?? {})) {
	if (!value) continue;
	if (process.env[key] !== undefined && process.env[key] !== "") continue;
	const escaped = value.replace(/'/g, "'\\''");
	if (useFish) {
		process.stdout.write(`set -gx ${key} '${escaped}'\n`);
	} else {
		process.stdout.write(`export ${key}='${escaped}'\n`);
	}
}

if (process.argv.includes("--path-only")) {
	process.stdout.write(resolveConfigPath() + "\n");
}
