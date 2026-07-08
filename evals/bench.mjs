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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadYamlFile } from "./lib/yaml.mjs";
import { runPi } from "./lib/pi.mjs";
import { buildCompare, buildReport, collectRecords } from "./lib/report.mjs";
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
		const expected = String(entry.expected ?? "").trim();
		if (!id) fail(`${casesPath}: case ${index + 1} is missing 'id'`);
		if (seen.has(id)) fail(`${casesPath}: duplicate case id '${id}'`);
		seen.add(id);
		if (!question) fail(`${casesPath}: case '${id}' is missing 'question'`);
		if (!expected) fail(`${casesPath}: case '${id}' is missing 'expected'`);
		const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
		return { id, question, expected, tags };
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

async function cmdRun(argv) {
	const { positional, options } = parseArgs(argv, {
		models: "value",
		thinking: "value",
		variants: "value",
		samples: "value",
		limit: "value",
		"run-id": "value",
		resume: "boolean",
		"dry-run": "boolean",
	});
	const benchmarkName = positional[0] ?? fail("usage: bench run <benchmark> --models <id,...>");
	const benchDir = path.join(EVALS_DIR, "benchmarks", benchmarkName);
	if (!existsSync(benchDir)) fail(`unknown benchmark '${benchmarkName}' (expected ${benchDir})`);

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

	log(`run start: benchmark=${config.benchmark} run=${runId} items=${items.length} dry_run=${config.dry_run}`);
	let failed = 0;
	let skipped = 0;
	for (const [index, item] of items.entries()) {
		const { itemId, caseData, model, variant, sample } = item;
		const artifactDir = path.join(runDir, "artifacts", itemId);
		const parsedPath = path.join(artifactDir, "parsed.json");
		const progress = `[${index + 1}/${items.length}]`;

		if (options.resume && existsSync(parsedPath)) {
			const existing = JSON.parse(readFileSync(parsedPath, "utf8"));
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
		};

		log(`${progress} answer start: case=${caseData.id} model=${model.id} thinking=${model.thinking} variant=${variant.id} sample=${sample}`);
		appendFileSync(manifestPath, `${JSON.stringify({ ts: new Date().toISOString(), item_id: itemId, state: "answer_running" })}\n`);
		mkdirSync(artifactDir, { recursive: true });
		writeFileSync(path.join(artifactDir, "system-prompt.md"), variant.text);

		// Dry-run answers mix right/wrong deterministically (keyed off the item
		// hash) so both grader paths and compare get exercised without a model.
		const dryRunText = config.dry_run ? (parseInt(itemId.slice(-2), 16) % 3 ? caseData.expected : "dry-run-wrong-label") : null;
		const answer = runPi({
			prompt: caseData.question,
			systemPrompt: variant.text,
			model: model.id,
			thinking: model.thinking,
			artifactDir,
			dryRunText,
		});
		record.timing = { answer_seconds: answer.elapsedSeconds, item_seconds: answer.elapsedSeconds };

		if (answer.exitCode !== 0) {
			failed++;
			Object.assign(record, { status: "error", phase: "answer", error: answer.errorMessage, answer: answer.text, score: null, max_score: null, description: answer.errorMessage });
			log(`${progress} answer error: case=${caseData.id} error=${answer.errorMessage.split("\n")[0]}`);
		} else {
			try {
				const graded = await grade({ caseData, answer: answer.text });
				Object.assign(record, { status: "ok", answer: answer.text, score: graded.score, max_score: graded.maxScore, description: graded.description });
				log(`${progress} graded: case=${caseData.id} score=${graded.score}/${graded.maxScore} (${graded.description})`);
			} catch (error) {
				failed++;
				Object.assign(record, { status: "error", phase: "grade", error: String(error), answer: answer.text, score: null, max_score: null, description: String(error) });
				log(`${progress} grade error: case=${caseData.id} error=${error}`);
			}
		}

		writeFileSync(parsedPath, `${JSON.stringify(record, null, 2)}\n`);
		appendFileSync(resultsPath, `${JSON.stringify(record)}\n`);
		appendFileSync(manifestPath, `${JSON.stringify({ ts: new Date().toISOString(), item_id: itemId, state: "complete", status: record.status, score: record.score })}\n`);
	}

	const reportPath = writeReport(runDir);
	log(`run complete: attempted=${items.length - skipped} skipped=${skipped} failed=${failed}`);
	console.log(`\nReport: ${reportPath}`);
	process.exit(failed ? 1 : 0);
}

function writeReport(runDir) {
	const configPath = path.join(runDir, "config.json");
	if (!existsSync(configPath)) fail(`not a run directory (no config.json): ${runDir}`);
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	const records = collectRecords(runDir);
	const reportPath = path.join(runDir, "report.md");
	writeFileSync(reportPath, buildReport(config, records));
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

function cmdCompare(argv) {
	const { positional } = parseArgs(argv, {});
	if (positional.length !== 2) fail("usage: bench compare <run-dir-a> <run-dir-b>");
	console.log(buildCompare(loadRun(positional[0]), loadRun(positional[1])));
}

const USAGE = `Usage:
  node evals/bench.mjs run <benchmark> --models <id,...> [--thinking off,...] [--variants id,...]
                                       [--samples N] [--limit N] [--run-id id] [--resume] [--dry-run]
  node evals/bench.mjs report <run-dir>
  node evals/bench.mjs compare <run-dir-a> <run-dir-b>`;

const [command, ...rest] = process.argv.slice(2);
if (command === "run") await cmdRun(rest);
else if (command === "report") cmdReport(rest);
else if (command === "compare") cmdCompare(rest);
else {
	console.error(USAGE);
	process.exit(command ? 1 : 0);
}
