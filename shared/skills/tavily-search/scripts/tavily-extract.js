#!/usr/bin/env node

import process from "node:process";
import { parseNum, pickEnum, postTavily, printJson, readOption } from "./tavily-common.js";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: tavily-extract.js <url1> [url2] [...] [options]");
	console.log("");
	console.log("Options:");
	console.log("  --depth DEPTH    Extract depth: basic, advanced (default: basic)");
	console.log("  --max-chars N    Content characters per URL in readable output (default: 6000)");
	console.log("  --json           Print raw JSON response instead of readable text");
	console.log("");
	console.log("Examples:");
	console.log("  tavily-extract.js https://example.com/article");
	console.log("  tavily-extract.js https://example.com/report --depth advanced --max-chars 8000");
}

if (args.length === 0 || args[0] === "--help") {
	usage();
	process.exit(0);
}

const urls = [];
const body = {
	extract_depth: "basic",
};
let jsonOutput = false;
let maxChars = 6000;

try {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--depth") {
			body.extract_depth = pickEnum(readOption(args, i, arg), ["basic", "advanced"], arg);
			i++;
		} else if (arg === "--max-chars") {
			maxChars = parseNum(readOption(args, i, arg), 6000, 100000);
			i++;
		} else if (arg === "--json") {
			jsonOutput = true;
		} else if (arg.startsWith("http://") || arg.startsWith("https://")) {
			urls.push(arg);
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			console.error(`Warning: ignoring invalid URL: ${arg}`);
		}
	}

	if (urls.length === 0) throw new Error("No URLs provided");

	const data = await postTavily("/extract", { ...body, urls });
	if (jsonOutput) {
		printJson(data);
		process.exit(0);
	}

	const results = data.results ?? [];
	if (results.length === 0) {
		console.log("No content retrieved");
	}

	results.forEach((result, index) => {
		const content = result.raw_content || result.content || "";
		const truncated = content.slice(0, maxChars);
		const suffix = content.length > maxChars ? "\n...[truncated]" : "";

		console.log(`\n${"=".repeat(80)}`);
		console.log(`[${index + 1}/${results.length}] ${result.title || "(untitled)"}`);
		console.log(`URL: ${result.url || "(no url)"}`);
		console.log(`${"=".repeat(80)}\n`);
		console.log(truncated ? `${truncated}${suffix}` : "(No content available)");
	});

	if (data.failed_results?.length) {
		console.error("\nFailed URLs:");
		data.failed_results.forEach((failure) => {
			console.error(`- ${failure.url || failure.id || "(unknown url)"}: ${failure.error || JSON.stringify(failure)}`);
		});
	}

	console.log(`\n${"=".repeat(80)}`);
	console.log(`Retrieved content from ${results.length} URL(s)`);
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
