import process from "node:process";
import { readRuntimeEnv, resolveRuntimeEnvPath, runtimeValue } from "../../../runtime-env/index.js";

export const API_BASE = "https://api.tavily.com";

export function loadTavilyKey() {
	const key = runtimeValue("TAVILY_API_KEY", readRuntimeEnv());
	return key || null;
}

export function requireTavilyKey() {
	const apiKey = loadTavilyKey();
	if (apiKey) return apiKey;

	console.error("Error: Tavily API key is not configured.");
	console.error(`Set TAVILY_API_KEY in ${resolveRuntimeEnvPath()} or run /mypi-env-config set TAVILY_API_KEY <key>`);
	console.error("Get your key from: https://app.tavily.com");
	console.error("In Pi: run /mypi-env-config for setup.");
	process.exit(1);
}

export function readOption(args, index, optionName) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${optionName}`);
	}
	return value;
}

export function parseNum(value, fallback, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(max, parsed);
}

export function pickEnum(value, allowed, optionName) {
	if (allowed.includes(value)) return value;
	throw new Error(`Invalid ${optionName}: ${value}. Expected one of: ${allowed.join(", ")}`);
}

export function printJson(data) {
	console.log(JSON.stringify(data, null, 2));
}

function formatRetryAfter(response) {
	const raw = response.headers.get("retry-after")?.trim();
	if (!raw) return "";
	const seconds = Number.parseInt(raw, 10);
	if (Number.isFinite(seconds) && seconds >= 0) return ` Retry after ${seconds}s.`;
	return ` Retry-After: ${raw}.`;
}

export async function postTavily(endpoint, body) {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${requireTavilyKey()}`,
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
		const detail = data?.detail ?? data?.error ?? data?.message ?? data;
		const message = typeof detail === "string" ? detail : JSON.stringify(detail);
		if (response.status === 401) {
			throw new Error(`Tavily authentication failed (HTTP 401): check TAVILY_API_KEY. ${message}`);
		}
		if (response.status === 429) {
			throw new Error(`Tavily rate limit exceeded (HTTP 429).${formatRetryAfter(response)} ${message}`);
		}
		if (response.status === 432 || response.status === 433) {
			throw new Error(`Tavily plan or credit limit exceeded (HTTP ${response.status}): ${message}`);
		}
		throw new Error(`Tavily API request failed (HTTP ${response.status}): ${message || "(no response body)"}`);
	}

	return data ?? {};
}
