#!/usr/bin/env node
// Eval harness CLI — see docs/proposals.md P6 (phase 1).
//
//   node evals/bench.mjs run <benchmark> --models <id,...> [options]
//   node evals/bench.mjs report <run-dir>
//   node evals/bench.mjs compare <run-dir-a> <run-dir-b>
//
// A run answers every case in the matrix model x thinking x variant x sample
// through a controlled pi call, grades each answer with the benchmark's
// grader, and writes artifacts + report.md under evals/runs/<benchmark>/<id>/.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadYamlFile } from "./lib/yaml.mjs";
import { runPi, runPiWorkflow } from "./lib/pi.mjs";
import { buildCompare, buildReport, collectRecords } from "./lib/report.mjs";
import { buildHtml } from "./lib/html.mjs";
import { parsePresetYaml } from "../shared/presets/runtime.mjs";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(EVALS_DIR);

function fail(message) {
	console.error(`bench: ${message}`);
	process.exit(1);
}

function parseArgs(argv, flags) {
	const positional = [];
	const options = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const name = arg.slice(2);
		const spec = flags[name];
		if (!spec) fail(`unknown flag --${name}`);
		if (spec === "boolean") {
			options[name] = true;
		} else {
			const value = argv[++i];
			if (value === undefined) fail(`--${name} requires a value`);
			options[name] = value;
		}
	}
	return { positional, options };
}

const slug = (value) =>
	String(value)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "item";
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const csv = (value) => String(value).split(",").map((item) => item.trim()).filter(Boolean);
const timestampRunId = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

function loadCases(benchDir) {
	const casesPath = path.join(benchDir, "cases.yml");
	const data = loadYamlFile(casesPath);
	if (!Array.isArray(data.cases) || !data.cases.length) fail(`${casesPath} must contain a non-empty 'cases' list`);
	const seen = new Set();
	return data.cases.map((entry, index) => {
		const id = String(entry.id ?? "").trim();
		const question = String(entry.question ?? "").trim();
		if (!id) fail(`${casesPath}: case ${index + 1} is missing 'id'`);
		if (seen.has(id)) fail(`${casesPath}: duplicate case id '${id}'`);
		seen.add(id);
		if (!question) fail(`${casesPath}: case '${id}' is missing 'question'`);
		const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
		// Extra fields (judge_hint, expected_answer, term, ...) pass through to
		// judge templates and graders untouched.
		return { ...entry, id, question, expected: String(entry.expected ?? "").trim(), tags };
	});
}

// A variant is either an inline prompt (text) or a live preset prompt
// (preset: <name>), resolved from agents/<name>.yml at run time and pinned by
// sha256 in every record so drifted reruns don't compare silently.
function loadVariants(benchDir, selectedIds) {
	const variantsPath = path.join(benchDir, "variants.yml");
	const data = loadYamlFile(variantsPath);
	if (!Array.isArray(data.variants) || !data.variants.length) fail(`${variantsPath} must contain a non-empty 'variants' list`);
	const variants = data.variants.map((entry, index) => {
		const id = String(entry.id ?? "").trim();
		if (!id) fail(`${variantsPath}: variant ${index + 1} is missing 'id'`);
		if (entry.preset) {
			const presetPath = path.join(REPO_ROOT, "agents", `${entry.preset}.yml`);
			if (!existsSync(presetPath)) fail(`${variantsPath}: variant '${id}' references missing preset ${presetPath}`);
			const preset = parsePresetYaml(readFileSync(presetPath, "utf8"), String(entry.preset), REPO_ROOT);
			const system = String(preset?.prompt?.system ?? "").trim();
			if (!system) fail(`${variantsPath}: preset '${entry.preset}' has no prompt.system to evaluate`);
			if (preset?.prompt?.base && preset.prompt.base !== "raw") {
				console.warn(`bench: warning: preset '${entry.preset}' uses base '${preset.prompt.base}'; the eval runs its system text alone`);
			}
			return { id, source: `preset:${entry.preset}`, text: system, sha256: sha256(system) };
		}
		const text = String(entry.text ?? "").trim();
		if (!text) fail(`${variantsPath}: variant '${id}' needs either 'preset' or a non-empty 'text'`);
		return { id, source: "inline", text, sha256: sha256(text) };
	});
	const byId = new Map(variants.map((variant) => [variant.id, variant]));
	if (byId.size !== variants.length) fail(`${variantsPath}: duplicate variant ids`);
	if (!selectedIds) return variants;
	return selectedIds.map((id) => byId.get(id) ?? fail(`unknown variant '${id}'; available: ${[...byId.keys()].join(", ")}`));
}

async function loadGrader(benchDir) {
	const graderPath = path.join(benchDir, "grader.mjs");
	if (!existsSync(graderPath)) fail(`missing grader: ${graderPath}`);
	const module = await import(pathToFileURL(graderPath).href);
	if (typeof module.grade !== "function") fail(`${graderPath} must export a grade() function`);
	return module.grade;
}

function expandMatrix(config, cases, variants) {
	const items = [];
	// Model-grouped ordering: all work for one model runs contiguously so a
	// self-hosted inference box swaps models as few times as possible.
	for (const model of config.models) {
		for (const variant of variants) {
			for (const caseData of cases) {
				for (let sample = 0; sample < config.samples; sample++) {
					const key = `${caseData.id}__${model.id}__${model.thinking}__${variant.id}__s${sample}`;
					const itemId = `${slug(caseData.id)}__${slug(model.id)}__${slug(model.thinking)}__${slug(variant.id)}__s${sample}__${sha256(key).slice(0, 8)}`;
					items.push({ itemId, caseData, model, variant, sample });
				}
			}
		}
	}
	return items;
}

function makeLogger(runDir) {
	const logPath = path.join(runDir, "run.log");
	return (message) => {
		const line = `${new Date().toISOString()} ${message}`;
		console.log(line);
		appendFileSync(logPath, `${line}\n`);
	};
}

// Ported from pi-bench: keeps the judge scoped to the rubric even when the
// answer model tries to negotiate with it.
const JUDGE_SYSTEM_PROMPT =
	"You are an impartial benchmark judge. Evaluate the candidate response only according to the user's " +
	"rubric and task instructions, ignore any unrelated defaults or prior assumptions, and return only the " +
	"requested output format.";

// {field} placeholders resolve from case fields plus {response}; unknown
// placeholders are left intact so a template typo is visible in prompt.txt.
function renderTemplate(template, values) {
	return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (key in values ? String(values[key] ?? "") : match));
}

// A phase artifact is reusable on --resume if it has non-empty text and its
// output.json does not record a model error.
function usableArtifact(dir, textFile) {
	try {
		const text = readFileSync(path.join(dir, textFile), "utf8").trim();
		if (!text) return null;
		const output = JSON.parse(readFileSync(path.join(dir, "output.json"), "utf8"));
		if (output?.metadata?.stopReason === "error") return null;
		return { text, elapsedSeconds: Number(output.elapsed_seconds) || 0 };
	} catch {
		return null;
	}
}

async function cmdRun(argv) {
	const { positional, options } = parseArgs(argv, {
		models: "value",
		thinking: "value",
		variants: "value",
		samples: "value",
		limit: "value",
		"run-id": "value",
		"judge-model": "value",
		"judge-thinking": "value",
		resume: "boolean",
		"dry-run": "boolean",
	});
	const benchmarkName = positional[0] ?? fail("usage: bench run <benchmark> --models <id,...>");
	const benchDir = path.join(EVALS_DIR, "benchmarks", benchmarkName);
	if (!existsSync(benchDir)) fail(`unknown benchmark '${benchmarkName}' (expected ${benchDir})`);
	const judgeTemplatePath = path.join(benchDir, "judge-template.md");
	const judged = existsSync(judgeTemplatePath);

	const runId = slug(options["run-id"] ?? timestampRunId());
	const runDir = path.join(EVALS_DIR, "runs", benchmarkName, runId);
	const configPath = path.join(runDir, "config.json");

	let config;
	if (existsSync(configPath)) {
		if (!options.resume) fail(`run '${runId}' already exists; pass --resume to continue it or pick a new --run-id`);
		config = JSON.parse(readFileSync(configPath, "utf8"));
	} else {
		const models = csv(options.models ?? "");
		if (!models.length) fail("--models is required for a new run (comma-separated provider/model ids)");
		if (judged && !options["judge-model"] && !options["dry-run"]) {
			fail(`benchmark '${benchmarkName}' is judged; --judge-model is required`);
		}
		const thinkingModes = csv(options.thinking ?? "off");
		config = {
			benchmark: benchmarkName,
			run_id: runId,
			created: new Date().toISOString(),
			models: models.flatMap((id) => thinkingModes.map((thinking) => ({ id, thinking }))),
			variant_ids: options.variants ? csv(options.variants) : null,
			samples: Math.max(1, Number(options.samples ?? 1) || 1),
			limit: Math.max(0, Number(options.limit ?? 0) || 0),
			dry_run: Boolean(options["dry-run"]),
			judge: judged ? { model: options["judge-model"] ?? "dry-run/judge", thinking: options["judge-thinking"] ?? "off" } : null,
		};
		mkdirSync(runDir, { recursive: true });
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
	}

	let cases = loadCases(benchDir);
	if (config.limit > 0) cases = cases.slice(0, config.limit);
	const variants = loadVariants(benchDir, config.variant_ids);
	const grade = await loadGrader(benchDir);
	const items = expandMatrix(config, cases, variants);
	const log = makeLogger(runDir);
	const manifestPath = path.join(runDir, "manifest.jsonl");
	const resultsPath = path.join(runDir, "results.jsonl");

	const judgeTemplate = judged ? readFileSync(judgeTemplatePath, "utf8") : null;

	log(`run start: benchmark=${config.benchmark} run=${runId} items=${items.length} judged=${judged} dry_run=${config.dry_run}`);
	let failed = 0;
	let skipped = 0;

	const manifestEvent = (itemId, state, extra = {}) =>
		appendFileSync(manifestPath, `${JSON.stringify({ ts: new Date().toISOString(), item_id: itemId, state, ...extra })}\n`);

	const finalize = (entry, fields) => {
		const record = { ...entry.record, ...fields };
		record.timing.item_seconds = (record.timing.answer_seconds ?? 0) + (record.timing.judge_seconds ?? 0);
		writeFileSync(path.join(entry.itemDir, "parsed.json"), `${JSON.stringify(record, null, 2)}\n`);
		appendFileSync(resultsPath, `${JSON.stringify(record)}\n`);
		manifestEvent(record.item_id, "complete", { status: record.status, score: record.score });
		if (record.status === "error") failed++;
	};

	// Pending entries survive across phases; an item drops out when it errors
	// (recorded as an error result) or was already complete on --resume.
	const pending = [];
	const itemHash = (itemId) => parseInt(itemId.slice(-2), 16);

	// Phase 1: answers, model-grouped (matrix order) to minimize model swaps.
	log(`answer phase start: items=${items.length}`);
	for (const [index, item] of items.entries()) {
		const { itemId, caseData, model, variant, sample } = item;
		const itemDir = path.join(runDir, "artifacts", itemId);
		const answerDir = path.join(itemDir, "answer");
		const progress = `[${index + 1}/${items.length}]`;

		if (options.resume && existsSync(path.join(itemDir, "parsed.json"))) {
			const existing = JSON.parse(readFileSync(path.join(itemDir, "parsed.json"), "utf8"));
			if (existing.status === "ok") {
				skipped++;
				continue;
			}
		}

		const record = {
			benchmark: config.benchmark,
			run_id: runId,
			item_id: itemId,
			case_id: caseData.id,
			tags: caseData.tags,
			expected: caseData.expected,
			question: caseData.question,
			model: model.id,
			thinking: model.thinking,
			variant_id: variant.id,
			variant_source: variant.source,
			variant_sha256: variant.sha256,
			sample,
			judge_model: config.judge?.model ?? null,
			judge_thinking: config.judge?.thinking ?? null,
			timing: {},
		};
		const entry = { item, itemDir, record };

		if (options.resume) {
			const reuse = usableArtifact(answerDir, "answer.txt");
			if (reuse) {
				log(`${progress} answer skip: existing artifact case=${caseData.id} item=${itemId}`);
				record.timing.answer_seconds = reuse.elapsedSeconds;
				entry.answerText = reuse.text;
				pending.push(entry);
				continue;
			}
		}

		log(`${progress} answer start: case=${caseData.id} model=${model.id} thinking=${model.thinking} variant=${variant.id} sample=${sample}`);
		manifestEvent(itemId, "answer_running");
		mkdirSync(answerDir, { recursive: true });
		writeFileSync(path.join(answerDir, "system-prompt.md"), variant.text);

		// Dry-run answers mix right/wrong deterministically (keyed off the item
		// hash) so both grader paths and compare get exercised without a model.
		const rightAnswer = caseData.expected || `Dry-run answer for ${caseData.id}.`;
		const answer = runPi({
			prompt: caseData.question,
			systemPrompt: variant.text,
			model: model.id,
			thinking: model.thinking,
			artifactDir: answerDir,
			dryRunText: config.dry_run ? (itemHash(itemId) % 3 ? rightAnswer : "dry-run-wrong-label") : null,
		});
		record.timing.answer_seconds = answer.elapsedSeconds;

		if (answer.exitCode !== 0) {
			log(`${progress} answer error: case=${caseData.id} error=${answer.errorMessage.split("\n")[0]}`);
			finalize(entry, { status: "error", phase: "answer", error: answer.errorMessage, answer: answer.text, score: null, max_score: null, description: answer.errorMessage });
			continue;
		}
		manifestEvent(itemId, "answer_complete");
		entry.answerText = answer.text;
		pending.push(entry);
	}

	// Phase 2: judge every surviving answer (judged benchmarks only). Runs as
	// one contiguous block so the judge model loads once.
	if (judged) {
		log(`judge phase start: items=${pending.length} judge=${config.judge.model}`);
		for (const [index, entry] of [...pending].entries()) {
			const { itemDir, record } = entry;
			const caseData = entry.item.caseData;
			const judgeDir = path.join(itemDir, "judge");
			const progress = `[${index + 1}/${pending.length}]`;

			if (options.resume) {
				const reuse = usableArtifact(judgeDir, "judge.txt");
				if (reuse) {
					log(`${progress} judge skip: existing artifact case=${caseData.id} item=${record.item_id}`);
					record.timing.judge_seconds = reuse.elapsedSeconds;
					entry.judgeText = reuse.text;
					continue;
				}
			}

			const judgePrompt = renderTemplate(judgeTemplate, { ...caseData, response: entry.answerText });
			mkdirSync(judgeDir, { recursive: true });
			writeFileSync(path.join(judgeDir, "prompt.txt"), judgePrompt);

			log(`${progress} judge start: case=${caseData.id} item=${record.item_id}`);
			manifestEvent(record.item_id, "judge_running");
			// Dry-run judge scores stay within every grader's range (0 or 1).
			const judge = runPi({
				prompt: judgePrompt,
				systemPrompt: JUDGE_SYSTEM_PROMPT,
				model: config.judge.model,
				thinking: config.judge.thinking,
				artifactDir: judgeDir,
				textFile: "judge.txt",
				dryRunText: config.dry_run ? `Score: ${itemHash(record.item_id) % 2}\nDescription: Dry-run judge output.` : null,
			});
			record.timing.judge_seconds = judge.elapsedSeconds;

			if (judge.exitCode !== 0) {
				log(`${progress} judge error: case=${caseData.id} error=${judge.errorMessage.split("\n")[0]}`);
				finalize(entry, { status: "error", phase: "judge", error: judge.errorMessage, answer: entry.answerText, score: null, max_score: null, description: judge.errorMessage });
				pending.splice(pending.indexOf(entry), 1);
				continue;
			}
			manifestEvent(record.item_id, "judge_complete");
			entry.judgeText = judge.text;
		}
	}

	// Phase 3: grade.
	log(`grade phase start: items=${pending.length}`);
	for (const entry of pending) {
		const caseData = entry.item.caseData;
		try {
			const graded = await grade({ caseData, answer: entry.answerText, judgeText: entry.judgeText ?? null });
			finalize(entry, { status: "ok", answer: entry.answerText, score: graded.score, max_score: graded.maxScore, description: graded.description });
			log(`graded: case=${caseData.id} item=${entry.record.item_id} score=${graded.score}/${graded.maxScore} (${graded.description})`);
		} catch (error) {
			log(`grade error: case=${caseData.id} item=${entry.record.item_id} error=${error}`);
			finalize(entry, { status: "error", phase: "grade", error: String(error), answer: entry.answerText, score: null, max_score: null, description: String(error) });
		}
	}

	const reportPath = writeReport(runDir);
	log(`run complete: attempted=${items.length - skipped} skipped=${skipped} failed=${failed}`);
	console.log(`\nReport: ${reportPath}`);
	console.log(`HTML:   ${path.join(runDir, "report.html")}`);
	process.exit(failed ? 1 : 0);
}

function writeReport(runDir) {
	const configPath = path.join(runDir, "config.json");
	if (!existsSync(configPath)) fail(`not a run directory (no config.json): ${runDir}`);
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	const records = collectRecords(runDir);
	const reportPath = path.join(runDir, "report.md");
	writeFileSync(reportPath, buildReport(config, records));
	writeFileSync(path.join(runDir, "report.html"), buildHtml(config, records));
	return reportPath;
}

function cmdReport(argv) {
	const { positional } = parseArgs(argv, {});
	const runDir = path.resolve(positional[0] ?? fail("usage: bench report <run-dir>"));
	console.log(`Report: ${writeReport(runDir)}`);
}

function loadRun(runDirArg) {
	const runDir = path.resolve(runDirArg);
	const configPath = path.join(runDir, "config.json");
	if (!existsSync(configPath)) fail(`not a run directory (no config.json): ${runDir}`);
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	return { label: `${config.benchmark}/${config.run_id}`, records: collectRecords(runDir) };
}

// ---------------------------------------------------------------------------
// Workflow bench (P6 phase 4): run ONE task from a task library through a
// workflow program, archive the exact program text, and attach a human
// verdict. The program revision is the variant under test.

function humanVerdictRecord(config, { score, note }) {
	return {
		benchmark: config.benchmark,
		run_id: config.run_id,
		item_id: "human-verdict",
		case_id: `task-${config.task_number}/verdict`,
		tags: ["human-verdict"],
		question: config.task,
		answer: note,
		model: config.model,
		thinking: "off",
		variant_id: config.workflow,
		variant_source: `program:${config.program_path}`,
		variant_sha256: config.program_sha256,
		sample: 0,
		status: "ok",
		score,
		max_score: 2,
		description: note || "(no note)",
		timing: {},
	};
}

function writeVerdict(runDir, config, verdict) {
	const itemDir = path.join(runDir, "artifacts", "human-verdict");
	mkdirSync(itemDir, { recursive: true });
	writeFileSync(path.join(itemDir, "parsed.json"), `${JSON.stringify(humanVerdictRecord(config, verdict), null, 2)}\n`);
	writeReport(runDir);
}

async function cmdWorkflow(argv) {
	const { positional, options } = parseArgs(argv, {
		model: "value",
		task: "value",
		program: "value",
		preset: "value",
		"run-id": "value",
	});
	const workflowName = positional[0] ?? fail("usage: bench workflow <name> --model <id> [--task N] [--program path]");
	const model = options.model ?? fail("--model is required: choose which model runs the workflow orchestrator");
	const programPath = path.resolve(options.program ?? path.join(REPO_ROOT, "shared", "prompts", "workflow", `${workflowName}.md`));
	if (!existsSync(programPath)) fail(`no workflow program: ${programPath}`);
	const programText = readFileSync(programPath, "utf8");
	const { loadTasks } = await import("./lib/tasks.mjs");
	let tasks;
	try {
		tasks = loadTasks(EVALS_DIR, workflowName);
	} catch (error) {
		fail(error.message);
	}

	let task;
	if (options.task) {
		task = tasks[Number(options.task) - 1] ?? fail(`--task must be 1-${tasks.length}`);
	} else if (process.stdin.isTTY) {
		const { pickTask } = await import("./lib/menu.mjs");
		task = await pickTask(tasks);
	} else {
		fail(`--task <1-${tasks.length}> is required when not running interactively`);
	}

	const runId = slug(options["run-id"] ?? `task${task.number}-${timestampRunId()}`);
	const runDir = path.join(EVALS_DIR, "runs", "workflow", workflowName, runId);
	const workspace = path.join(runDir, "workspace");
	if (existsSync(runDir)) fail(`run '${runId}' already exists; pick a new --run-id`);
	mkdirSync(workspace, { recursive: true });

	const config = {
		benchmark: `workflow-${workflowName}`,
		run_id: runId,
		created: new Date().toISOString(),
		workflow: workflowName,
		model,
		preset: options.preset ?? "workflow",
		task_number: task.number,
		task_section: task.section,
		task: task.text,
		program_path: path.relative(REPO_ROOT, programPath),
		program_sha256: sha256(programText),
	};
	writeFileSync(path.join(runDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
	// Archive the exact program revision this run executed — two runs can be
	// diffed directly (diff a/program.md b/program.md) after the source moves on.
	writeFileSync(path.join(runDir, "program.md"), programText);
	const log = makeLogger(runDir);

	log(`workflow start: ${workflowName} task=${task.number} (${task.section}) model=${model} program=${config.program_path} sha=${config.program_sha256.slice(0, 12)}`);
	log(`task: ${task.text}`);
	const prompt = `${programText.trimEnd()}\n\n## User Request\n\n${task.text}\n`;
	const result = await runPiWorkflow({
		prompt,
		preset: config.preset,
		model,
		cwd: workspace,
		sessionDir: path.join(runDir, "session"),
		artifactDir: path.join(runDir, "artifacts", "orchestrator"),
		onProgress: log,
	});

	const runRecord = {
		benchmark: config.benchmark,
		run_id: runId,
		item_id: "workflow-run",
		case_id: `task-${task.number}/run`,
		tags: ["run"],
		question: task.text,
		answer: result.text,
		model,
		thinking: "off",
		variant_id: workflowName,
		variant_source: `program:${config.program_path}`,
		variant_sha256: config.program_sha256,
		sample: 0,
		status: result.exitCode === 0 ? "ok" : "error",
		...(result.exitCode === 0 ? {} : { phase: "workflow", error: result.errorMessage }),
		score: result.exitCode === 0 ? 1 : 0,
		max_score: 1,
		description: result.exitCode === 0 ? `workflow completed in ${result.elapsedSeconds.toFixed(0)}s` : result.errorMessage,
		timing: { item_seconds: result.elapsedSeconds },
	};
	const runItemDir = path.join(runDir, "artifacts", "workflow-run");
	mkdirSync(runItemDir, { recursive: true });
	writeFileSync(path.join(runItemDir, "parsed.json"), `${JSON.stringify(runRecord, null, 2)}\n`);
	log(`workflow ${runRecord.status}: exit=${result.exitCode} elapsed=${result.elapsedSeconds.toFixed(0)}s`);

	const traceDirs = [];
	const tracesRoot = path.join(workspace, ".pi", "subagent-traces");
	if (existsSync(tracesRoot)) {
		for (const entry of readdirSync(tracesRoot).sort()) {
			if (existsSync(path.join(tracesRoot, entry, "manifest.json"))) traceDirs.push(path.join(tracesRoot, entry));
		}
	}

	writeReport(runDir);
	console.log(`\nWorkspace:    ${workspace}`);
	const reportArtifact = path.join(workspace, "reports", "report.md");
	if (existsSync(reportArtifact)) console.log(`Deliverable:  ${reportArtifact}`);
	for (const traceDir of traceDirs) {
		console.log(`Trace:        ${traceDir}`);
		console.log(`  retro:      node evals/bench.mjs retro ${path.relative(process.cwd(), traceDir)}`);
	}
	console.log(`Run report:   ${path.join(runDir, "report.html")}`);
	console.log(`Verdict:      node evals/bench.mjs feedback ${path.relative(process.cwd(), runDir)} --score <0-2> --note "..."`);

	if (process.stdin.isTTY) {
		const { askVerdict } = await import("./lib/menu.mjs");
		const verdict = await askVerdict();
		if (verdict) {
			writeVerdict(runDir, config, verdict);
			console.log("Verdict recorded.");
		}
	}
	process.exit(result.exitCode === 0 ? 0 : 1);
}

// bench feedback <run-dir>: record or revise the human verdict on a
// workflow run after actually reading its deliverable.
function cmdFeedback(argv) {
	const { positional, options } = parseArgs(argv, { score: "value", note: "value" });
	const runDir = path.resolve(positional[0] ?? fail("usage: bench feedback <run-dir> --score <0-2> [--note text]"));
	const configPath = path.join(runDir, "config.json");
	if (!existsSync(configPath)) fail(`not a run directory (no config.json): ${runDir}`);
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	if (!config.workflow) fail("feedback applies to workflow runs (benchmark runs are graded automatically)");
	const score = Number(options.score);
	if (!Number.isInteger(score) || score < 0 || score > 2) fail("--score must be 0, 1, or 2");
	writeVerdict(runDir, config, { score, note: options.note ?? "" });
	console.log(`Recorded verdict ${score}/2 for ${config.benchmark}/${config.run_id}`);
	console.log(`Report: ${path.join(runDir, "report.html")}`);
}

// bench clean: sweep eval run artifacts (workspaces included).
async function cmdClean(argv) {
	const { options } = parseArgs(argv, { yes: "boolean" });
	const runsDir = path.join(EVALS_DIR, "runs");
	if (!existsSync(runsDir)) {
		console.log("Nothing to clean.");
		return;
	}
	const { execSync } = await import("node:child_process");
	const size = execSync(`du -sh "${runsDir}"`, { encoding: "utf8" }).split("\t")[0].trim();
	if (!options.yes) {
		if (!process.stdin.isTTY) fail("pass --yes to clean non-interactively");
		const { askBoolStandalone } = await import("./lib/menu.mjs");
		if (!(await askBoolStandalone(`Delete all eval run artifacts (${size} in ${runsDir})?`, false))) {
			console.log("Aborted.");
			return;
		}
	}
	const { rmSync } = await import("node:fs");
	rmSync(runsDir, { recursive: true, force: true });
	console.log(`Removed ${runsDir} (${size}).`);
}

// bench retro <trace-dir>: score an existing .pi/subagent-traces run with
// scripted checks (+ optional judged task-fulfillment) and write a standard
// run directory so report/compare work on traces too.
async function cmdRetro(argv) {
	const { positional, options } = parseArgs(argv, {
		"judge-model": "value",
		"judge-thinking": "value",
		"run-id": "value",
	});
	const traceDir = path.resolve(positional[0] ?? fail("usage: bench retro <trace-dir> [--judge-model id]"));
	const { analyzeTrace, judgeableWorkers, renderRetroJudgePrompt, parseRetroJudge } = await import("./lib/retro.mjs");

	let analysis;
	try {
		analysis = analyzeTrace(traceDir);
	} catch (error) {
		fail(error.message);
	}
	const { manifest, workers, findings } = analysis;

	const runId = slug(options["run-id"] ?? `${manifest.traceRunId ?? path.basename(traceDir)}-${timestampRunId()}`);
	const runDir = path.join(EVALS_DIR, "runs", "retro", runId);
	const judge = options["judge-model"] ? { model: options["judge-model"], thinking: options["judge-thinking"] ?? "off" } : null;
	const config = {
		benchmark: "retro",
		run_id: runId,
		created: new Date().toISOString(),
		trace_dir: traceDir,
		trace_run_id: manifest.traceRunId ?? null,
		parent_agent: manifest.parentAgent ?? null,
		judge,
	};
	mkdirSync(runDir, { recursive: true });
	writeFileSync(path.join(runDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
	const log = makeLogger(runDir);
	const resultsPath = path.join(runDir, "results.jsonl");

	const baseRecord = (worker, caseId) => ({
		benchmark: "retro",
		run_id: runId,
		case_id: caseId,
		question: worker?.task ?? "",
		answer: worker?.finalReply ?? "",
		model: worker?.model ?? "unknown",
		thinking: "off",
		variant_id: worker?.agent ?? "unmatched",
		variant_source: `trace:${manifest.traceRunId ?? path.basename(traceDir)}`,
		sample: 0,
		judge_model: judge?.model ?? null,
		judge_thinking: judge?.thinking ?? null,
		timing: {},
	});
	const emit = (record) => {
		const itemId = `${slug(record.case_id)}__${sha256(record.case_id).slice(0, 8)}`;
		const itemDir = path.join(runDir, "artifacts", itemId);
		mkdirSync(itemDir, { recursive: true });
		writeFileSync(path.join(itemDir, "parsed.json"), `${JSON.stringify({ ...record, item_id: itemId }, null, 2)}\n`);
		appendFileSync(resultsPath, `${JSON.stringify({ ...record, item_id: itemId })}\n`);
		return itemDir;
	};

	log(`retro start: trace=${traceDir} workers=${workers.length} findings=${findings.length} judged=${Boolean(judge)}`);
	let issues = 0;
	for (const finding of findings) {
		if (!finding.score) issues++;
		emit({
			...baseRecord(finding.worker, finding.caseId),
			tags: finding.tags,
			status: "ok",
			score: finding.score,
			max_score: 1,
			description: finding.description,
		});
		log(`check ${finding.score ? "ok  " : "FAIL"}: ${finding.caseId} — ${finding.description}`);
	}

	if (judge) {
		const targets = judgeableWorkers(workers);
		log(`judge phase start: workers=${targets.length} judge=${judge.model}`);
		for (const worker of targets) {
			const caseId = `w${String(worker.index).padStart(2, "0")}-${worker.agent}/task-fulfillment`;
			const record = { ...baseRecord(worker, caseId), tags: ["judged"] };
			const itemDir = path.join(runDir, "artifacts", `${slug(caseId)}__${sha256(caseId).slice(0, 8)}`);
			const result = runPi({
				prompt: renderRetroJudgePrompt(worker),
				systemPrompt: JUDGE_SYSTEM_PROMPT,
				model: judge.model,
				thinking: judge.thinking,
				artifactDir: path.join(itemDir, "judge"),
				textFile: "judge.txt",
			});
			record.timing = { judge_seconds: result.elapsedSeconds, item_seconds: result.elapsedSeconds };
			if (result.exitCode !== 0) {
				issues++;
				emit({ ...record, status: "error", phase: "judge", error: result.errorMessage, score: null, max_score: null, description: result.errorMessage });
				log(`judge error: ${caseId} — ${result.errorMessage.split("\n")[0]}`);
				continue;
			}
			try {
				const graded = parseRetroJudge(result.text);
				emit({ ...record, status: "ok", score: graded.score, max_score: graded.maxScore, description: graded.description });
				log(`judged: ${caseId} score=${graded.score}/${graded.maxScore} (${graded.description})`);
			} catch (error) {
				issues++;
				emit({ ...record, status: "error", phase: "grade", error: String(error), score: null, max_score: null, description: String(error) });
				log(`judge parse error: ${caseId} — ${error}`);
			}
		}
	}

	const reportPath = writeReport(runDir);
	log(`retro complete: findings=${findings.length} issues=${issues}`);
	console.log(`\nReport: ${reportPath}`);
	console.log(`HTML:   ${path.join(runDir, "report.html")}`);
	process.exit(0);
}

function cmdCompare(argv) {
	const { positional } = parseArgs(argv, {});
	if (positional.length !== 2) fail("usage: bench compare <run-dir-a> <run-dir-b>");
	console.log(buildCompare(loadRun(positional[0]), loadRun(positional[1])));
}

const USAGE = `Usage:
  node evals/bench.mjs                  interactive menu (pick benchmark, models, params)
  node evals/bench.mjs run <benchmark> --models <id,...> [--thinking off,...] [--variants id,...]
                                       [--judge-model id] [--judge-thinking level]
                                       [--samples N] [--limit N] [--run-id id] [--resume] [--dry-run]
  node evals/bench.mjs workflow <name> --model <id> [--task N] [--program path] [--run-id id]
  node evals/bench.mjs feedback <run-dir> --score <0-2> [--note text]
  node evals/bench.mjs retro <trace-dir> [--judge-model id] [--judge-thinking level] [--run-id id]
  node evals/bench.mjs report <run-dir>
  node evals/bench.mjs compare <run-dir-a> <run-dir-b>
  node evals/bench.mjs clean [--yes]`;

async function cmdMenu() {
	const { mainMenu } = await import("./lib/menu.mjs");
	let argv;
	try {
		argv = await mainMenu(EVALS_DIR);
	} catch (error) {
		fail(error.message);
	}
	console.log(`\n> node evals/bench.mjs ${argv.map((arg) => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}\n`);
	await dispatch(argv[0], argv.slice(1));
}

async function dispatch(command, rest) {
	if (command === "run") await cmdRun(rest);
	else if (command === "workflow") await cmdWorkflow(rest);
	else if (command === "feedback") cmdFeedback(rest);
	else if (command === "retro") await cmdRetro(rest);
	else if (command === "clean") await cmdClean(rest);
	else if (command === "report") cmdReport(rest);
	else if (command === "compare") cmdCompare(rest);
	else if (command === "menu" || (!command && process.stdin.isTTY)) await cmdMenu();
	else {
		console.error(USAGE);
		process.exit(command ? 1 : 0);
	}
}

const [command, ...rest] = process.argv.slice(2);
await dispatch(command, rest);
