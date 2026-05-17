/**
 * Prepends curated script directories to process.env.PATH once per extension load.
 * Pi's bash spawns inherit via getShellEnv(), so bare commands like `todo` work
 * without per-invocation source. Idempotent across reload (no duplicate segments).
 */

import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Package root (parent of `extensions/`). */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PROMOTED_SKILLS_FILE = join(PACKAGE_ROOT, "scripts", "path-promoted-skills.txt");

function readPromotedSkillNames(): string[] {
	const raw = readFileSync(PROMOTED_SKILLS_FILE, "utf8");
	const names: string[] = [];
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
			throw new Error(
				`path-promoted-skills.txt: invalid skill name "${trimmed}" (no path segments or "..")`,
			);
		}
		names.push(trimmed);
	}
	return names;
}

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

	let skillNames: string[];
	try {
		skillNames = readPromotedSkillNames();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`bootstrap-path: cannot read ${PROMOTED_SKILLS_FILE}: ${msg}`);
	}

	for (const name of skillNames) {
		const abs = resolve(PACKAGE_ROOT, "shared", "skills", name, "scripts");
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
