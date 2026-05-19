#!/usr/bin/env node

import process from "node:process";
import { parseNum, postExa, printJson, printResultList, readOption } from "./exa-common.js";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: exa-search.js <query> [options]");
	console.log("");
	console.log("Options:");
	console.log("  --num N                  Number of results (default: 10, max: 10)");
	console.log("  --type TYPE              Search type: auto, fast, instant, deep-lite, deep, deep-reasoning");
	console.log("  --category TYPE          Filter by category: news, research paper, company, people, etc.");
	console.log("  --date-after YYYY-MM-DD  Only results after this date");
	console.log("  --date-before YYYY-MM-DD Only results before this date");
	console.log("  --highlights QUERY       Return highlighted excerpts for each result");
	console.log("  --text                   Return page text, capped at 10000 characters per result");
	console.log("  --json                   Print raw JSON response instead of readable text");
	console.log("");
	console.log("Examples:");
	console.log('  exa-search.js "AI search APIs" --num 5');
	console.log('  exa-search.js "recent AI regulation" --category news --date-after 2026-01-01');
	console.log('  exa-search.js "RAG evaluation methods" --highlights "benchmarks metrics"');
}

if (args.length === 0 || args[0] === "--help") {
	usage();
	process.exit(0);
}

const queryParts = [];
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
		} else if (arg === "--type") {
			body.type = readOption(args, i, arg);
			i++;
		} else if (arg === "--category") {
			body.category = readOption(args, i, arg);
			i++;
		} else if (arg === "--date-after") {
			body.startPublishedDate = readOption(args, i, arg);
			i++;
		} else if (arg === "--date-before") {
			body.endPublishedDate = readOption(args, i, arg);
			i++;
		} else if (arg === "--highlights") {
			body.contents = {
				...(body.contents ?? {}),
				highlights: { query: readOption(args, i, arg), maxCharacters: 4000 },
			};
			i++;
		} else if (arg === "--text") {
			body.contents = {
				...(body.contents ?? {}),
				text: { maxCharacters: 10000 },
			};
		} else if (arg === "--json") {
			jsonOutput = true;
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			queryParts.push(arg);
		}
	}

	const query = queryParts.join(" ").trim();
	if (!query) throw new Error("No query provided");

	const data = await postExa("/search", { ...body, query });
	if (jsonOutput) {
		printJson(data);
		process.exit(0);
	}

	printResultList(data.results, "results");
	console.log("Tip: Use exa-contents.js with promising URLs to fetch highlights or text.");
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}
