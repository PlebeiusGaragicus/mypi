// Interactive front door for the eval bench: one home menu covering every
// bench command. Each flow only gathers choices and returns the exact argv
// that the CLI accepts — the equivalent one-liner is printed before launch,
// so anything done through the menu is reproducible as a command.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

import { loadYamlFile } from "./yaml.mjs";
import { listTaskLibraries, loadTasks } from "./tasks.mjs";

const MODELS_FILE = path.join(homedir(), ".pi", "agent", "models.json");

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

const printOptions = (options) => options.forEach((option, index) => console.log(`  ${index + 1}. ${option}`));

// Accepts numbers ("1,3"), custom ids, or a mix; blank takes the default.
async function selectMany(prompter, title, options, defaults) {
	console.log(title);
	printOptions(options);
	const reply = await prompter.ask("Choose by number (comma-separated) or type custom ids", defaults.join(","));
	return reply
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean)
		.map((token) => (/^\d+$/.test(token) && Number(token) >= 1 && Number(token) <= options.length ? options[Number(token) - 1] : token));
}

async function selectOne(prompter, title, options, fallback) {
	return (await selectMany(prompter, title, options, [fallback]))[0];
}

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

async function pickModels(prompter, title, { many }) {
	const configured = listConfiguredModels();
	if (!configured.length) {
		console.log(`(no ${MODELS_FILE} found — enter model ids manually)`);
		const raw = await prompter.ask(`${title} (comma-separated provider/model ids)`);
		const models = raw.split(",").map((m) => m.trim()).filter(Boolean);
		if (!models.length) throw new Error("at least one model is required");
		return models;
	}
	const picked = many
		? await selectMany(prompter, title, configured, [configured[0]])
		: [await selectOne(prompter, title, configured, configured[0])];
	if (!picked.length) throw new Error("at least one model is required");
	return picked;
}

// Every run directory under evals/runs (any depth) with a config.json,
// newest first.
function listRuns(evalsDir, filter = () => true) {
	const runsDir = path.join(evalsDir, "runs");
	const found = [];
	const walk = (dir, depth) => {
		if (depth > 3 || !existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const child = path.join(dir, entry.name);
			const configPath = path.join(child, "config.json");
			if (existsSync(configPath)) {
				try {
					const config = JSON.parse(readFileSync(configPath, "utf8"));
					found.push({ dir: child, config });
				} catch {
					// unreadable config: skip
				}
			} else {
				walk(child, depth + 1);
			}
		}
	};
	walk(runsDir, 0);
	return found.filter((run) => filter(run.config)).sort((a, b) => String(b.config.created).localeCompare(String(a.config.created)));
}

async function pickRun(prompter, evalsDir, title, filter) {
	const runs = listRuns(evalsDir, filter);
	if (!runs.length) throw new Error("no matching runs found under evals/runs — run something first");
	const labels = runs.map((run) => `${run.config.benchmark}/${run.config.run_id} (${String(run.config.created ?? "").slice(0, 16)})`);
	console.log(title);
	printOptions(labels);
	const picked = Number(await prompter.ask(`Choose by number (1-${runs.length})`, "1"));
	const run = runs[picked - 1];
	if (!run) throw new Error(`no run number ${picked}`);
	return run.dir;
}

// Pick one task from a task library (also used by bench workflow --task-less).
export async function pickTask(tasks, prompter = null) {
	const own = !prompter;
	if (own) prompter = createPrompter();
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
		if (own) prompter.close();
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

async function benchmarkMenu(prompter, evalsDir) {
	const benchmarks = listBenchmarks(path.join(evalsDir, "benchmarks"));
	console.log("Benchmarks:");
	printOptions(
		benchmarks.map(
			(b) => `${b.name} — ${b.caseCount} cases, ${b.judged ? "judged" : "deterministic"}${b.description ? ` — ${b.description}` : ""}`,
		),
	);
	const picked = await prompter.ask("Choose a benchmark by number", "1");
	const benchmark = benchmarks[Number(picked) - 1] ?? benchmarks.find((b) => b.name === picked);
	if (!benchmark) throw new Error(`no such benchmark: ${picked}`);

	const models = await pickModels(prompter, "Answer models:", { many: true });
	const thinking = await selectMany(prompter, "Thinking modes (matrix over each model):", ["off", "low", "medium", "high"], ["off"]);
	const variants = await selectMany(prompter, "System-prompt variants:", benchmark.variants, benchmark.variants);

	const argv = ["run", benchmark.name, "--models", models.join(","), "--thinking", thinking.join(","), "--variants", variants.join(",")];

	const dryRun = await prompter.askBool("Dry run (no model calls)?", false);
	if (benchmark.judged && !dryRun) {
		const [judgeModel] = await pickModels(prompter, "Judge model (prefer your strongest model, ideally a different family):", { many: false });
		argv.push("--judge-model", judgeModel);
		const judgeThinking = await prompter.ask("Judge thinking level (off/low/medium/high)", "off");
		if (judgeThinking !== "off") argv.push("--judge-thinking", judgeThinking);
	}

	const samples = await prompter.ask("Samples per case (repeats each matrix cell)", "1");
	if (Number(samples) > 1) argv.push("--samples", samples);
	const limit = await prompter.ask(`How many cases (of ${benchmark.caseCount}; blank = all)`, "");
	if (limit && Number(limit) > 0) argv.push("--limit", limit);
	const runId = await prompter.ask("Run id", "timestamp");
	if (runId && runId !== "timestamp") argv.push("--run-id", runId);
	if (dryRun) argv.push("--dry-run");

	const cells = models.length * thinking.length * variants.length * (limit ? Math.min(Number(limit), benchmark.caseCount) : benchmark.caseCount);
	const calls = cells * Math.max(1, Number(samples) || 1) * (benchmark.judged ? 2 : 1);
	console.log(`\n  Model calls: ~${calls}${dryRun ? " (dry run — no real calls)" : ""}`);
	if (!(await prompter.askBool("Launch?", true))) throw new Error("aborted");
	return argv;
}

async function workflowMenu(prompter, evalsDir) {
	const libraries = listTaskLibraries(evalsDir);
	if (!libraries.length) throw new Error("no task libraries under evals/tasks/");
	const workflow = libraries.length === 1 ? libraries[0] : await selectOne(prompter, "Workflow:", libraries, libraries[0]);
	const [model] = await pickModels(prompter, "Orchestrator model (runs the workflow):", { many: false });
	const task = await pickTask(loadTasks(evalsDir, workflow), prompter);
	console.log(`\n  Task ${task.number}: ${task.text}\n  This runs the full workflow — it may take a while.`);
	if (!(await prompter.askBool("Launch?", true))) throw new Error("aborted");
	return ["workflow", workflow, "--model", model, "--task", String(task.number)];
}

async function feedbackMenu(prompter, evalsDir) {
	const runDir = await pickRun(prompter, evalsDir, "Which workflow run are you scoring?", (config) => Boolean(config.workflow));
	const score = await prompter.ask("Score 0-2 (0 bad, 1 mixed, 2 good)");
	if (!["0", "1", "2"].includes(score)) throw new Error("score must be 0, 1, or 2");
	const note = await prompter.ask("One-line note (what was good/bad)", "");
	const argv = ["feedback", runDir, "--score", score];
	if (note) argv.push("--note", note);
	return argv;
}

function listTraceDirs(evalsDir) {
	const roots = [path.join(process.cwd(), ".pi", "subagent-traces")];
	for (const run of listRuns(evalsDir, (config) => Boolean(config.workflow))) {
		roots.push(path.join(run.dir, "workspace", ".pi", "subagent-traces"));
	}
	const traces = [];
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const entry of readdirSync(root).sort().reverse()) {
			if (existsSync(path.join(root, entry, "manifest.json"))) traces.push(path.join(root, entry));
		}
	}
	return traces;
}

async function retroMenu(prompter, evalsDir) {
	const traces = listTraceDirs(evalsDir);
	if (!traces.length) throw new Error("no traces found (looked in ./.pi/subagent-traces and workflow run workspaces)");
	console.log("Traces:");
	printOptions(traces.map((trace) => path.relative(process.cwd(), trace)));
	const picked = Number(await prompter.ask(`Choose by number (1-${traces.length})`, "1"));
	const trace = traces[picked - 1];
	if (!trace) throw new Error(`no trace number ${picked}`);
	const argv = ["retro", trace];
	if (await prompter.askBool("Also judge each worker's task fulfillment (needs a judge model)?", false)) {
		const [judgeModel] = await pickModels(prompter, "Judge model:", { many: false });
		argv.push("--judge-model", judgeModel);
	}
	return argv;
}

async function compareMenu(prompter, evalsDir) {
	const a = await pickRun(prompter, evalsDir, "Baseline run (A):");
	const b = await pickRun(prompter, evalsDir, "Candidate run (B):");
	return ["compare", a, b];
}

export async function mainMenu(evalsDir) {
	const prompter = createPrompter();
	try {
		console.log("mypi eval bench — what would you like to do?\n");
		const actions = [
			["Run a benchmark", "score models/prompts on a case suite"],
			["Run a workflow task", "one task through a workflow program, then score it"],
			["Score a workflow run", "record your verdict after reading the deliverable"],
			["Retro a trace", "procedural checks over a workflow's subagent trace"],
			["Compare two runs", "did a prompt change actually help?"],
			["Rebuild a report", "regenerate report.md/.html for a past run"],
			["Clean up", "delete all run artifacts"],
		];
		printOptions(actions.map(([name, blurb]) => `${name} — ${blurb}`));
		const choice = Number(await prompter.ask("\nChoose by number", "1"));
		switch (choice) {
			case 1:
				return await benchmarkMenu(prompter, evalsDir);
			case 2:
				return await workflowMenu(prompter, evalsDir);
			case 3:
				return await feedbackMenu(prompter, evalsDir);
			case 4:
				return await retroMenu(prompter, evalsDir);
			case 5:
				return await compareMenu(prompter, evalsDir);
			case 6:
				return ["report", await pickRun(prompter, evalsDir, "Which run?")];
			case 7:
				return ["clean"];
			default:
				throw new Error(`no such action: ${choice}`);
		}
	} finally {
		prompter.close();
	}
}
