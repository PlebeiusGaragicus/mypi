// Interactive eval launcher: pick a benchmark, models, and params from
// menus, see the equivalent non-interactive command, confirm, run.
//
// The menu never runs anything itself — it builds the exact argv that
// `bench run` accepts and hands it back, so every interactive run prints a
// copy-pasteable command for reproducing or scripting it later.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

import { loadYamlFile } from "./yaml.mjs";

const MODELS_FILE = path.join(homedir(), ".pi", "agent", "models.json");

function listBenchmarks(benchmarksDir) {
	const benchmarks = [];
	for (const name of readdirSync(benchmarksDir).sort()) {
		const dir = path.join(benchmarksDir, name);
		const casesPath = path.join(dir, "cases.yml");
		if (!existsSync(casesPath)) continue;
		const data = loadYamlFile(casesPath);
		const variantsData = loadYamlFile(path.join(dir, "variants.yml"));
		benchmarks.push({
			name,
			description: String(data.description ?? "").trim(),
			caseCount: Array.isArray(data.cases) ? data.cases.length : 0,
			judged: existsSync(path.join(dir, "judge-template.md")),
			variants: (variantsData.variants ?? []).map((variant) => String(variant.id)),
		});
	}
	if (!benchmarks.length) throw new Error(`no benchmarks found under ${benchmarksDir}`);
	return benchmarks;
}

// Configured models from ~/.pi/agent/models.json as provider/id labels.
// Never prints anything but names — the file also holds API keys.
function listConfiguredModels() {
	try {
		const data = JSON.parse(readFileSync(MODELS_FILE, "utf8"));
		const models = [];
		for (const [provider, entry] of Object.entries(data.providers ?? {})) {
			for (const model of entry?.models ?? []) {
				if (model?.id) models.push(`${provider}/${model.id}`);
			}
		}
		return models.sort();
	} catch {
		return [];
	}
}

// A persistent line listener with a queue instead of rl.question(): between
// question() calls readline has no listener attached, so piped input (e.g.
// scripted menu runs) would flow and be silently dropped.
export function createPrompter() {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
	const bufferedLines = [];
	const waiters = [];
	let closed = false;
	rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : bufferedLines.push(line)));
	rl.on("close", () => {
		closed = true;
		while (waiters.length) waiters.shift()(null);
	});
	const nextLine = () => {
		if (bufferedLines.length) return Promise.resolve(bufferedLines.shift());
		if (closed) return Promise.resolve(null);
		return new Promise((resolve) => waiters.push(resolve));
	};
	const ask = async (question, fallback = "") => {
		process.stdout.write(`${question}${fallback ? ` [${fallback}]` : ""}: `);
		const line = await nextLine();
		if (line === null) {
			process.stdout.write("\n");
			throw new Error("input closed before the menu finished");
		}
		return line.trim() || fallback;
	};
	const askBool = async (question, fallback) => {
		const reply = (await ask(question, fallback ? "Y/n" : "y/N")).toLowerCase();
		if (["y", "yes"].includes(reply)) return true;
		if (["n", "no"].includes(reply)) return false;
		return fallback;
	};
	return { ask, askBool, close: () => rl.close() };
}

// Pick one task from a task library (used by bench workflow).
export async function pickTask(tasks) {
	const prompter = createPrompter();
	try {
		let section = null;
		for (const task of tasks) {
			if (task.section !== section) {
				section = task.section;
				console.log(`\n# ${section}`);
			}
			console.log(`  ${task.number}. ${task.text.length > 110 ? `${task.text.slice(0, 110)}…` : task.text}`);
		}
		console.log("");
		const picked = Number(await prompter.ask(`Choose one task by number (1-${tasks.length})`, "1"));
		const task = tasks[picked - 1];
		if (!task) throw new Error(`no task number ${picked}`);
		return task;
	} finally {
		prompter.close();
	}
}

// Post-run human verdict; returns null when skipped.
export async function askVerdict() {
	const prompter = createPrompter();
	try {
		const raw = await prompter.ask("Score this run 0-2 (blank to skip and use `bench feedback` later)", "");
		if (raw === "") return null;
		const score = Number(raw);
		if (!Number.isInteger(score) || score < 0 || score > 2) {
			console.log("Not a valid score; skipping — record later with `bench feedback`.");
			return null;
		}
		const note = await prompter.ask("One-line note (what was good/bad)", "");
		return { score, note };
	} finally {
		prompter.close();
	}
}

export async function askBoolStandalone(question, fallback) {
	const prompter = createPrompter();
	try {
		return await prompter.askBool(question, fallback);
	} finally {
		prompter.close();
	}
}

export async function runMenu(evalsDir) {
	const { ask, askBool, close } = createPrompter();
	const printOptions = (options) => options.forEach((option, index) => console.log(`  ${index + 1}. ${option}`));
	// Accepts numbers ("1,3"), custom ids, or a mix; blank takes the default.
	const selectMany = async (title, options, defaults) => {
		console.log(title);
		printOptions(options);
		const reply = await ask("Choose by number (comma-separated) or type custom ids", defaults.join(","));
		return reply
			.split(",")
			.map((token) => token.trim())
			.filter(Boolean)
			.map((token) => (/^\d+$/.test(token) && Number(token) >= 1 && Number(token) <= options.length ? options[Number(token) - 1] : token));
	};
	const selectOne = async (title, options, fallback) => (await selectMany(title, options, [fallback]))[0];

	try {
		const benchmarks = listBenchmarks(path.join(evalsDir, "benchmarks"));
		console.log("Benchmarks:");
		printOptions(
			benchmarks.map(
				(b) => `${b.name} — ${b.caseCount} cases, ${b.judged ? "judged" : "deterministic"}${b.description ? ` — ${b.description}` : ""}`,
			),
		);
		const picked = await ask("Choose a benchmark by number", "1");
		const benchmark = benchmarks[Number(picked) - 1] ?? benchmarks.find((b) => b.name === picked);
		if (!benchmark) throw new Error(`no such benchmark: ${picked}`);

		const configured = listConfiguredModels();
		let models;
		if (configured.length) {
			models = await selectMany("Answer models:", configured, [configured[0]]);
		} else {
			console.log(`(no ${MODELS_FILE} found — enter model ids manually)`);
			models = (await ask("Answer models (comma-separated provider/model ids)")).split(",").map((m) => m.trim()).filter(Boolean);
		}
		if (!models.length) throw new Error("at least one answer model is required");

		const thinking = await selectMany("Thinking modes (matrix over each model):", ["off", "low", "medium", "high"], ["off"]);
		const variants = await selectMany("System-prompt variants:", benchmark.variants, benchmark.variants);

		const argv = ["run", benchmark.name, "--models", models.join(","), "--thinking", thinking.join(","), "--variants", variants.join(",")];

		const dryRun = await askBool("Dry run (no model calls)?", false);
		if (benchmark.judged && !dryRun) {
			const judgeModel = configured.length
				? await selectOne("Judge model (prefer your strongest model, ideally a different family):", configured, configured[0])
				: await ask("Judge model (provider/model id)");
			if (!judgeModel) throw new Error("judged benchmarks need a judge model");
			argv.push("--judge-model", judgeModel);
			const judgeThinking = await ask("Judge thinking level (off/low/medium/high)", "off");
			if (judgeThinking !== "off") argv.push("--judge-thinking", judgeThinking);
		}

		const samples = await ask("Samples per case (repeats each matrix cell)", "1");
		if (Number(samples) > 1) argv.push("--samples", samples);
		const limit = await ask(`How many cases (of ${benchmark.caseCount}; blank = all)`, "");
		if (limit && Number(limit) > 0) argv.push("--limit", limit);
		const runId = await ask("Run id", "timestamp");
		if (runId && runId !== "timestamp") argv.push("--run-id", runId);
		if (dryRun) argv.push("--dry-run");

		const cells = models.length * thinking.length * variants.length * (limit ? Math.min(Number(limit), benchmark.caseCount) : benchmark.caseCount);
		const calls = cells * Math.max(1, Number(samples) || 1) * (benchmark.judged ? 2 : 1);
		console.log("\nRun summary");
		console.log(`  Benchmark: ${benchmark.name} (${benchmark.judged ? "judged" : "deterministic"})`);
		console.log(`  Model calls: ~${calls}${dryRun ? " (dry run — no real calls)" : ""}`);
		console.log(`  Command: node evals/bench.mjs ${argv.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n`);
		if (!(await askBool("Launch?", true))) throw new Error("aborted");
		return argv;
	} finally {
		close();
	}
}
