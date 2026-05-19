#!/usr/bin/env node

import process from "node:process";
import { parseNum, pickEnum, postTavily, printJson, readOption } from "./tavily-common.js";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: tavily-search.js <query> [options]");
	console.log("");
	console.log("Options:");
	console.log("  --num N                 Number of results (default: 10, max: 20)");
	console.log("  --topic TYPE            Topic: general, news, finance");
	console.log("  --time-range RANGE      Time range: day, week, month, year");
	console.log("  --search-depth DEPTH    Search depth: basic, advanced (default: basic)");
	console.log("  --max-raw-chars N       Raw excerpt characters per result (default: 2000)");
	console.log("  --json                  Print raw JSON response instead of readable text");
	console.log("");
	console.log("Examples:");
	console.log('  tavily-search.js "AI search APIs" --num 5');
	console.log('  tavily-search.js "recent AI regulation" --topic news --time-range week');
}

if (args.length === 0 || args[0] === "--help") {
	usage();
	process.exit(0);
}

const queryParts = [];
const body = {
	max_results: 10,
	search_depth: "basic",
	include_raw_content: true,
	include_answer: false,
	include_usage: true,
};
let jsonOutput = false;
let maxRawChars = 2000;

try {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--num") {
			body.max_results = parseNum(readOption(args, i, arg), 10, 20);
			i++;
		} else if (arg === "--topic") {
			body.topic = pickEnum(readOption(args, i, arg), ["general", "news", "finance"], arg);
			i++;
		} else if (arg === "--time-range") {
			body.time_range = pickEnum(readOption(args, i, arg), ["day", "week", "month", "year"], arg);
			i++;
		} else if (arg === "--search-depth") {
			body.search_depth = pickEnum(readOption(args, i, arg), ["basic", "advanced"], arg);
			i++;
		} else if (arg === "--max-raw-chars") {
			maxRawChars = parseNum(readOption(args, i, arg), 2000, 50000);
			i++;
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

	const data = await postTavily("/search", { ...body, query });
	if (jsonOutput) {
		printJson(data);
		process.exit(0);
	}

	const results = data.results ?? [];
	if (results.length === 0) {
		console.log("No results found");
		process.exit(0);
	}

	console.log(`Found ${results.length} results for: ${query}`);
	if (typeof data.usage?.credits === "number") {
		console.log(`Credits used: ${data.usage.credits}`);
	}
	console.log("");

	results.forEach((result, index) => {
		console.log(`${index + 1}. ${result.title || "(untitled)"}`);
		console.log(`   URL: ${result.url || "(no url)"}`);
		if (typeof result.score === "number") console.log(`   Score: ${result.score.toFixed(3)}`);
		if (result.content) console.log(`   Snippet: ${result.content}`);
		if (result.raw_content) {
			const truncated = result.raw_content.slice(0, maxRawChars);
			const suffix = result.raw_content.length > maxRawChars ? "\n   ...[truncated]" : "";
			console.log("   Raw excerpt:");
			console.log(indentBlock(truncated, "   ") + suffix);
		}
		console.log();
	});

	console.log("Tip: Use tavily-extract.js with promising URLs when you need deeper page content.");
} catch (error) {
	console.error(`Error: ${error.message}`);
	process.exit(1);
}

function indentBlock(text, prefix) {
	return text
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}
