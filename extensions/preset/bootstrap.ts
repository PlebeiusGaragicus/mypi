import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyRuntimeEnv } from "../../shared/runtime-env/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROMOTED_SKILLS_FILE = join(PACKAGE_ROOT, "scripts", "path-promoted-skills.txt");
const BROWSE_BIN = join(PACKAGE_ROOT, "utilities", "browser-runtime", "dist", "browse");

function readPromotedSkillNames(): string[] {
	const raw = readFileSync(PROMOTED_SKILLS_FILE, "utf8");
	const names: string[] = [];
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
			throw new Error(`path-promoted-skills.txt: invalid skill name "${trimmed}" (no path segments or "..")`);
		}
		names.push(trimmed);
	}
	return names;
}

function pathEnvKey(): string {
	return Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function pathEntrySet(raw: string): Set<string> {
	const set = new Set<string>();
	for (const item of raw.split(delimiter)) {
		if (!item) continue;
		try {
			set.add(resolve(item));
		} catch {
			set.add(item);
		}
	}
	return set;
}

function prependAllowlistedScriptDirs(): void {
	const pathKey = pathEnvKey();
	let current = process.env[pathKey] ?? "";
	const seen = pathEntrySet(current);

	for (const name of readPromotedSkillNames()) {
		const abs = resolve(PACKAGE_ROOT, "shared", "skills", name, "scripts");
		if (!existsSync(abs)) continue;
		const normalized = resolve(abs);
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		current = current ? `${normalized}${delimiter}${current}` : normalized;
	}

	process.env[pathKey] = current;
}

applyRuntimeEnv();
prependAllowlistedScriptDirs();

if (!process.env.B && existsSync(BROWSE_BIN)) {
	process.env.B = BROWSE_BIN;
}
