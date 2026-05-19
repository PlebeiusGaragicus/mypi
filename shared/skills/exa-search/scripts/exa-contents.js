#!/usr/bin/env node

import process from "node:process";
import { postExa, printJson, readOption } from "./exa-common.js";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: exa-contents.js <url1> [url2] [...] [options]");
	console.log("");
	console.log("Options:");
	console.log("  --text                  Get clean text, capped at 10000 characters per URL");
	console.log('  --highlights "query"    Get highlighted excerpts matching query');
	console.log("  --json                  Print raw JSON response instead of readable text");
	console.log("");
	console.log("Examples:");
	console.log("  exa-contents.js https://example.com --text");
	console.log('  exa-contents.js https://example.com https://example.org --highlights "pricing limits"');
}

if (args.length === 0 || args[0] === "--help") {
	usage();
	process.exit(0);
}

const urls = [];
const body = {
	text: { maxCharacters: 10000 },
};
let jsonOutput = false;

try {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--text") {
			body.text = { maxCharacters: 10000 };
			delete body.highlights;
		} else if (arg === "--highlights") {
			body.highlights = { query: readOption(args, i, arg), maxCharacters: 4000 };
			delete body.text;
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

	const data = await postExa("/contents", { ...body, urls });
	if (jsonOutput) {
		printJson(data);
		process.exit(0);
	}

	const results = data.results ?? [];

	if (results.length === 0) {
		console.log("No content retrieved");
		process.exit(0);
	}

	results.forEach((result, index) => {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`[${index + 1}/${results.length}] ${result.title || "(untitled)"}`);
		console.log(`URL: ${result.url || result.id || "(no url)"}`);
		if (result.author) console.log(`Author: ${result.author}`);
		if (result.publishedDate) console.log(`Published: ${result.publishedDate}`);
		console.log(`${"=".repeat(80)}\n`);

		if (result.highlights?.length) {
			console.log("HIGHLIGHTS:");
			result.highlights.forEach((highlight, i) => {
				console.log(`${i + 1}. ${highlight}`);
			});
		} else if (result.text) {
			console.log(result.text);
		} else {
			console.log("(No content available)");
		}
	});

	console.log(`\n${"=".repeat(80)}`);
	console.log(`Retrieved content from ${results.length} URL(s)`);
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
