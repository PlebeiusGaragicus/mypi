import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function findDotPiRoot() {
	if (!process.env.DOT_PI_DIR) {
		throw new Error("DOT_PI_DIR is not set; run this skill through dispatch-agent.");
	}
	return process.env.DOT_PI_DIR;
}

export function findDotPiOverlay() {
	return process.env.DOT_PI_OVERLAY || path.join(process.env.HOME || "", ".pi", "dot-pi");
}

function overlayFirstFile(...names) {
	const overlay = findDotPiOverlay();
	for (const name of names) {
		const p = path.join(overlay, name);
		if (fs.existsSync(p)) return p;
	}
	return path.join(overlay, names[0]);
}

/** Parses KEY=value lines; supports # comments and blank lines. */
export function parseEnvFile(envPath) {
	const out = {};
	if (!fs.existsSync(envPath)) return out;

	const content = fs.readFileSync(envPath, "utf8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;

		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export function normalizeBaseUrl(url) {
	if (!url) return "";
	return url.trim().replace(/\/+$/, "");
}

export function loadNtfyConfig() {
	const filePath = overlayFirstFile("env.ntfy");
	const fileVars = parseEnvFile(filePath);

	function pick(key) {
		const envVal = process.env[key]?.trim();
		if (envVal && envVal !== `$${key}`) return envVal;
		return fileVars[key]?.trim() ?? "";
	}

	return {
		baseUrl: normalizeBaseUrl(pick("NTFY_BASE_URL")),
		user: pick("NTFY_USER"),
		password: pick("NTFY_PASSWORD"),
	};
}

export function requireNtfyConfig() {
	const config = loadNtfyConfig();
	if (!config.baseUrl) {
		console.error("Error: ntfy is not configured.");
		console.error("Configure with: dotpi keys   (or /api-keys in pi)");
		process.exit(1);
	}
	return config;
}

export function basicAuthHeaders(config) {
	if (!config.user && !config.password) return {};
	const token = Buffer.from(`${config.user}:${config.password}`, "utf8").toString("base64");
	return { Authorization: `Basic ${token}` };
}

export function readOption(args, index, optionName) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${optionName}`);
	}
	return value;
}
