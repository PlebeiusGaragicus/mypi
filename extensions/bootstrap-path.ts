/**
 * Prepends curated script directories to process.env.PATH once per extension load.
 * Pi's bash spawns inherit via getShellEnv(), so bare commands like `todo` work
 * without per-invocation source. Idempotent across reload (no duplicate segments).
 */

import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Parent of `extensions/` — works for `pi install .`, git installs under ~/.pi, etc. */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Repo-relative dirs to prepend (pick-and-choose; add more skills as needed). */
const SCRIPT_PATH_ALLOWLIST = [
	"shared/skills/todo/scripts"
] as const;

function pathEnvKey(): string {
	return Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
}

function pathEntrySet(raw: string): Set<string> {
	const set = new Set<string>();
	for (const p of raw.split(delimiter)) {
		if (!p) continue;
		try {
			set.add(resolve(p));
		} catch {
			set.add(p);
		}
	}
	return set;
}

function prependAllowlistedScriptDirs(): void {
	const pathKey = pathEnvKey();
	let current = process.env[pathKey] ?? "";
	const seen = pathEntrySet(current);

	for (const rel of SCRIPT_PATH_ALLOWLIST) {
		const abs = resolve(PACKAGE_ROOT, rel);
		if (!existsSync(abs)) continue;
		const normalized = resolve(abs);
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		current = current ? `${normalized}${delimiter}${current}` : normalized;
	}

	process.env[pathKey] = current;
}

prependAllowlistedScriptDirs();

export default function (_pi: ExtensionAPI) {}
