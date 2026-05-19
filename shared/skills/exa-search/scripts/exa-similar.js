#!/usr/bin/env node

import process from "node:process";
import { parseNum, postExa, printJson, printResultList, readOption } from "./exa-common.js";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: exa-similar.js <url> [options]");
	console.log("");
	console.log("Options:");
	console.log("  --num N          Number of results (default: 10, max: 10)");
	console.log("  --category TYPE  Filter by category: news, research paper, company, people, etc.");
	console.log("  --json           Print raw JSON response instead of readable text");
	console.log("");
	console.log("Examples:");
	console.log("  exa-similar.js https://example.com");
	console.log("  exa-similar.js https://example.com --num 5 --category news");
}

if (args.length === 0 || args[0] === "--help") {
	usage();
	process.exit(0);
}

let url = "";
const body = {
	numResults: 10,
};
let jsonOutput = false;

try {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--num") {
			body.numResults = parseNum(readOption(args, i, arg), 10, 10);
			i++;
		} else if (arg === "--category") {
			body.category = readOption(args, i, arg);
			i++;
		} else if (arg === "--json") {
			jsonOutput = true;
		} else if ((arg.startsWith("http://") || arg.startsWith("https://")) && !url) {
			url = arg;
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			console.error(`Warning: ignoring extra argument: ${arg}`);
		}
	}

	if (!url) throw new Error("No URL provided");

	const data = await postExa("/findSimilar", { ...body, url });
	if (jsonOutput) {
		printJson(data);
		process.exit(0);
	}

	printResultList(data.results, "similar pages");
	console.log("Tip: Use exa-contents.js with promising URLs to fetch highlights or text.");
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
