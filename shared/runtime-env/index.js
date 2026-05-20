import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE_PATH = path.join(PACKAGE_ROOT, "mypi.env.example");
const DEFAULT_ENV_PATH = path.join(os.homedir(), ".pi", "mypi", "mypi.env");
const VALID_KEY = /^[A-Z_][A-Z0-9_]*$/;

export function resolveRuntimeEnvPath() {
	const override = process.env.MYPI_ENV_FILE?.trim();
	if (override) return path.resolve(override);
	return DEFAULT_ENV_PATH;
}

export function resolveRuntimeEnvExamplePath() {
	return EXAMPLE_PATH;
}

function parseValue(raw) {
	const trimmed = String(raw ?? "").trim();
	if (!trimmed) return "";
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function parseRuntimeEnv(raw) {
	const env = {};
	for (const line of String(raw ?? "").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
		const equals = withoutExport.indexOf("=");
		if (equals <= 0) continue;
		const key = withoutExport.slice(0, equals).trim();
		if (!VALID_KEY.test(key)) continue;
		env[key] = parseValue(withoutExport.slice(equals + 1));
	}
	return env;
}

function quoteValue(value) {
	return JSON.stringify(String(value ?? ""));
}

export function formatRuntimeEnv(env, keyOrder = []) {
	const keys = new Set([...keyOrder, ...Object.keys(env).sort()]);
	return (
		[...keys]
			.filter((key) => VALID_KEY.test(key))
			.map((key) => `${key}=${quoteValue(env[key] ?? "")}`)
			.join("\n") + "\n"
	);
}

export function readRuntimeEnvExample() {
	if (!fs.existsSync(EXAMPLE_PATH)) return {};
	return parseRuntimeEnv(fs.readFileSync(EXAMPLE_PATH, "utf8"));
}

export function runtimeEnvKeys() {
	return Object.keys(readRuntimeEnvExample());
}

export function ensureRuntimeEnvFile() {
	const envPath = resolveRuntimeEnvPath();
	if (fs.existsSync(envPath)) return envPath;
	fs.mkdirSync(path.dirname(envPath), { recursive: true, mode: 0o700 });
	const body = fs.existsSync(EXAMPLE_PATH) ? fs.readFileSync(EXAMPLE_PATH, "utf8") : "";
	fs.writeFileSync(envPath, body, { encoding: "utf8", mode: 0o600 });
	try {
		fs.chmodSync(envPath, 0o600);
	} catch {
		/* ignore if platform does not support */
	}
	return envPath;
}

export function readRuntimeEnv({ createIfMissing = true } = {}) {
	const envPath = createIfMissing ? ensureRuntimeEnvFile() : resolveRuntimeEnvPath();
	if (!fs.existsSync(envPath)) return {};
	try {
		return parseRuntimeEnv(fs.readFileSync(envPath, "utf8"));
	} catch {
		return {};
	}
}

export function writeRuntimeEnv(env) {
	const envPath = resolveRuntimeEnvPath();
	fs.mkdirSync(path.dirname(envPath), { recursive: true, mode: 0o700 });
	const body = formatRuntimeEnv(env, runtimeEnvKeys());
	const tmp = `${envPath}.tmp.${process.pid}`;
	fs.writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
	fs.renameSync(tmp, envPath);
	try {
		fs.chmodSync(envPath, 0o600);
	} catch {
		/* ignore if platform does not support */
	}
}

export function runtimeValue(key, env = readRuntimeEnv()) {
	const fromProcess = process.env[key]?.trim();
	if (fromProcess && fromProcess !== `$${key}`) return fromProcess;
	return env[key]?.trim() ?? "";
}

export function applyRuntimeEnv(target = process.env) {
	for (const [key, value] of Object.entries(readRuntimeEnv())) {
		if (!value) continue;
		const existing = target[key];
		if (existing !== undefined && existing !== "") continue;
		target[key] = value;
	}
}

export function formatShellExports(env = readRuntimeEnv(), currentEnv = process.env, shell = process.env.SHELL ?? "") {
	const useFish = shell.includes("fish");
	const lines = [];
	for (const [key, value] of Object.entries(env)) {
		if (!value) continue;
		if (currentEnv[key] !== undefined && currentEnv[key] !== "") continue;
		const escaped = value.replace(/'/g, "'\\''");
		lines.push(useFish ? `set -gx ${key} '${escaped}'` : `export ${key}='${escaped}'`);
	}
	return lines.length ? `${lines.join("\n")}\n` : "";
}
