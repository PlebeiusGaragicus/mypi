#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import {
	basicAuthHeaders,
	readOption,
	requireNtfyConfig,
} from "./ntfy-common.js";

const DEFAULT_TOPIC = "bot";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: ntfy-send.js [options] <message...>");
	console.log("       echo message | ntfy-send.js [options]");
	console.log("");
	console.log("Options:");
	console.log(`  --topic NAME    ntfy topic (default: ${DEFAULT_TOPIC})`);
	console.log("  --title TEXT    Notification title (ntfy Title header)");
	console.log("  --priority N    1 (min) … 5 (max), default from server");
	console.log("  --tags LIST     Comma-separated tags (ntfy Tags header)");
	console.log("");
	console.log("Requires NTFY_BASE_URL and optional NTFY_USER / NTFY_PASSWORD");
	console.log("(environment or overlay env.ntfy). Configure with: dotpi keys   (or /api-keys in pi)");
	console.log("DOT_PI_DIR must be set when run through dispatch-agent.");
}

function parsePriority(raw) {
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1 || n > 5) {
		throw new Error(`Invalid --priority: ${raw}. Expected integer 1–5.`);
	}
	return String(n);
}

function readMessageFromStdin() {
	if (process.stdin.isTTY) return "";
	try {
		return fs.readFileSync(0, "utf8").trimEnd();
	} catch {
		return "";
	}
}

if (args[0] === "--help" || args[0] === "-h") {
	usage();
	process.exit(0);
}

let topic = DEFAULT_TOPIC;
let title = "";
let priority = "";
let tags = "";
const positionals = [];

try {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--topic") {
			topic = readOption(args, i, arg);
			i++;
		} else if (arg === "--title") {
			title = readOption(args, i, arg);
			i++;
		} else if (arg === "--priority") {
			priority = parsePriority(readOption(args, i, arg));
			i++;
		} else if (arg === "--tags") {
			tags = readOption(args, i, arg);
			i++;
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			positionals.push(arg);
		}
	}

	let message = positionals.join(" ").trim();

	if (!message) {
		message = readMessageFromStdin();
	}

	if (!message) {
		throw new Error("Missing message: pass message text as arguments or pipe stdin.");
	}

	const config = requireNtfyConfig();
	const url = `${config.baseUrl}/${encodeURIComponent(topic)}`;

	// Sanitize header values to ASCII only (HTTP spec requires ASCII headers)
	const sanitizeHeader = (str) => str.replace(/[^\x00-\x7F]/g, "");

	const headers = {
		...basicAuthHeaders(config),
	};

	if (title) headers.Title = sanitizeHeader(title);
	if (priority) headers.Priority = priority;
	if (tags) headers.Tags = tags;

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: message,
	});

	const text = await response.text();

	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			console.error(
				`Error: ntfy authentication failed (HTTP ${response.status}): check NTFY_USER / NTFY_PASSWORD.`,
			);
			if (text) console.error(text);
			process.exit(1);
		}
		if (response.status === 404) {
			console.error(`Error: topic or URL not found (HTTP 404): ${url}`);
			if (text) process.stderr.write(text + "\n");
			process.exit(1);
		}
		console.error(`Error: ntfy request failed (HTTP ${response.status})`);
		if (text) console.error(text);
		process.exit(1);
	}

	console.log(`Sent to ${topic}`);
	if (text) console.log(text.trimEnd());
} catch (err) {
	console.error(`Error: ${err.message}`);
	process.exit(1);
}
