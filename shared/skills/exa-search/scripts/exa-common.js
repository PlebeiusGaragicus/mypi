import process from "node:process";
import { ensureEnvKey } from "../../../mypi-config/ensure.js";
import { resolveConfigPath } from "../../../mypi-config/paths.js";

export const API_BASE = "https://api.exa.ai";

function pick(key, fileValue) {
	const envVal = process.env[key]?.trim();
	if (envVal && envVal !== `$${key}`) return envVal;
	return fileValue?.trim() ?? "";
}

export function loadExaKey() {
	const fileValue = ensureEnvKey("EXA_API_KEY", "");
	const key = pick("EXA_API_KEY", fileValue);
	return key || null;
}

export function requireExaKey() {
	const apiKey = loadExaKey();
	if (apiKey) return apiKey;

	console.error("Error: Exa API key is not configured.");
	console.error(`Set env.EXA_API_KEY in ${resolveConfigPath()}`);
	console.error("Get your key from: https://dashboard.exa.ai/api-keys");
	console.error("In Pi: run /mypi-config for the config path.");
	process.exit(1);
}

export function readOption(args, index, optionName) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${optionName}`);
	}
	return value;
}

export function parseNum(value, fallback = 10, max = 10) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(max, parsed);
}

export function printJson(data) {
	console.log(JSON.stringify(data, null, 2));
}

export async function postExa(endpoint, body) {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": requireExaKey(),
		},
		body: JSON.stringify(body),
	});

	const text = await response.text();
	let data = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { error: text };
		}
	}

	if (!response.ok) {
		const message = data?.error || data?.message || JSON.stringify(data) || "(no response body)";
		throw new Error(`Exa API request failed (HTTP ${response.status}): ${message}`);
	}

	return data ?? {};
}

export function printResultList(results, label = "results") {
	if (!results?.length) {
		console.log(`No ${label} found`);
		return;
	}

	console.log(`Found ${results.length} ${label}:\n`);
	results.forEach((result, index) => {
		console.log(`${index + 1}. ${result.title || "(untitled)"}`);
		console.log(`   URL: ${result.url || result.id || "(no url)"}`);
		if (result.publishedDate) console.log(`   Published: ${result.publishedDate}`);
		if (result.author) console.log(`   Author: ${result.author}`);
		if (typeof result.score === "number") console.log(`   Score: ${result.score.toFixed(3)}`);
		if (result.highlights?.length) {
			console.log("   Highlights:");
			for (const highlight of result.highlights.slice(0, 3)) {
				console.log(`   - ${highlight}`);
			}
		}
		console.log();
	});
}
