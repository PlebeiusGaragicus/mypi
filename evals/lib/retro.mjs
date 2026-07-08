// Trace retrospective (P6 phase 3): score an existing workflow trace
// (.pi/subagent-traces/<run-id>/) the same way benchmarks are scored, so
// reports and `bench compare` work unchanged.
//
// Two grader tiers:
//   - scripted checks: facts read straight from manifest.json and the worker
//     session JSONL files — no model calls
//   - judged dimension (optional, --judge-model): did the worker's final
//     reply fulfill its assigned task
//
// Record mapping: model = the LLM the worker ran on, variant = the agent
// preset name. Grouping by model|variant therefore answers both "which agent
// prompt misbehaves" and, across traces, "which local model orchestrates or
// works best".

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseScoreDescription } from "./score.mjs";

const RETRO_JUDGE_TEMPLATE = `You are grading whether a worker agent's final reply fulfills the task it was assigned. Judge only fulfillment of the stated task: did the reply deliver what was asked, in a form the requester can use? Ignore style. A reply that answers a different question, is empty, refuses without cause, or reports doing work without including the result is a failure.

The task assigned to the worker was:
{task}

The worker's final reply was:
{reply}

Grade the reply:

- Score 0: The reply does not fulfill the task (wrong deliverable, empty, off-topic, or claims work without showing the result).
- Score 1: The reply partially fulfills the task; significant parts are missing, unusable, or unverifiable.
- Score 2: The reply fulfills the task as assigned.

Return exactly two lines:
Score: <0, 1, or 2>
Description: <one sentence explaining which elements of the reply drove your score>`;

// The trace manifest truncates stored replies at 4000 chars; a task at that
// size almost always means an unbounded {previous} substitution (see P3).
const TASK_SIZE_LIMIT = 4000;
const LOOP_THRESHOLD = 3;

function sessionTimestamp(filename) {
	// 2026-07-08T04-55-35-128Z_<uuid>.jsonl -> epoch millis
	const match = filename.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
	if (!match) return null;
	return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
}

function readSessionMessages(filePath) {
	const messages = [];
	for (const line of readFileSync(filePath, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const event = JSON.parse(line);
			if (event?.type === "message" && event.message) messages.push(event.message);
		} catch {
			// tolerate partial writes from interrupted runs
		}
	}
	return messages;
}

function toolCallsOf(message) {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return [];
	return message.content.filter((item) => item?.type === "toolCall");
}

function check(name, tags, ok, okNote, failNote) {
	return { name, tags, score: ok ? 1 : 0, description: ok ? okNote : failNote };
}

function workerChecks(worker) {
	const checks = [];
	const errorNote = worker.errorMessage || worker.stderr || `exitCode=${worker.exitCode ?? "unknown"}`;
	const completed = Boolean(worker.endedAt) && (worker.exitCode ?? 1) === 0 && !worker.errorMessage && worker.stopReason !== "error";
	checks.push(check("completed", ["process"], completed, "worker exited cleanly", `worker did not complete cleanly: ${errorNote}`));
	checks.push(
		check(
			"reply-nonempty",
			["output"],
			Boolean((worker.finalReply ?? "").trim()),
			"final reply present",
			"final reply is empty — the orchestrator received nothing usable",
		),
	);
	checks.push(
		check(
			"task-size",
			["delegation"],
			(worker.task ?? "").length < TASK_SIZE_LIMIT,
			`task is ${worker.task?.length ?? 0} chars`,
			`task is ${worker.task.length} chars (>= ${TASK_SIZE_LIMIT}) — likely an unbounded {previous} substitution; hand off a file path instead`,
		),
	);
	return checks;
}

function sessionChecks(messages) {
	const checks = [];

	const toolErrors = [];
	for (const message of messages) {
		if (message.role === "toolResult" && message.isError) toolErrors.push(message.toolName ?? "unknown");
	}
	checks.push(
		check(
			"tool-errors",
			["tools"],
			toolErrors.length === 0,
			"no failed tool calls",
			`${toolErrors.length} failed tool call(s): ${[...new Set(toolErrors)].join(", ")}`,
		),
	);

	let worstStreak = 1;
	let streak = 1;
	let streakTool = "";
	let previous = null;
	for (const message of messages) {
		for (const call of toolCallsOf(message)) {
			const signature = `${call.name}:${JSON.stringify(call.arguments ?? {})}`;
			if (signature === previous) {
				streak++;
				if (streak > worstStreak) {
					worstStreak = streak;
					streakTool = call.name;
				}
			} else {
				streak = 1;
			}
			previous = signature;
		}
	}
	checks.push(
		check(
			"tool-loop",
			["tools"],
			worstStreak < LOOP_THRESHOLD,
			"no repeated identical tool calls",
			`identical ${streakTool} call repeated ${worstStreak}x in a row — the worker was stuck in a loop`,
		),
	);

	const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
	const finalText = (lastAssistant?.content ?? [])
		.filter((item) => item?.type === "text")
		.map((item) => item.text ?? "")
		.join("")
		.trim();
	checks.push(
		check("final-text", ["output"], Boolean(finalText), "session ends with assistant text", "session ends without assistant text (died mid-tool-use?)"),
	);
	return checks;
}

// Best-effort session->worker attribution by start-time window. Parallel
// workers can overlap; an ambiguous or unmatched session is still checked,
// just attributed to "unmatched".
function matchWorker(workers, sessionStartMs) {
	if (sessionStartMs === null) return null;
	const candidates = workers.filter((worker) => {
		const started = Date.parse(worker.startedAt) - 5000;
		const ended = worker.endedAt ? Date.parse(worker.endedAt) + 5000 : Infinity;
		return sessionStartMs >= started && sessionStartMs <= ended;
	});
	return candidates.length === 1 ? candidates[0] : null;
}

export function analyzeTrace(traceDir) {
	const manifestPath = path.join(traceDir, "manifest.json");
	if (!existsSync(manifestPath)) throw new Error(`not a trace directory (no manifest.json): ${traceDir}`);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const workers = Array.isArray(manifest.workers) ? manifest.workers : [];

	const findings = [];
	const workerLabel = (worker) => `w${String(worker.index).padStart(2, "0")}-${worker.agent}`;

	for (const worker of workers) {
		for (const result of workerChecks(worker)) {
			findings.push({ worker, caseId: `${workerLabel(worker)}/${result.name}`, ...result });
		}
	}

	const sessionFiles = readdirSync(traceDir).filter((name) => name.endsWith(".jsonl"));
	for (const file of sessionFiles) {
		const messages = readSessionMessages(path.join(traceDir, file));
		if (!messages.length) continue;
		const worker = matchWorker(workers, sessionTimestamp(file));
		const label = worker ? workerLabel(worker) : `unmatched-${file.slice(0, 19)}`;
		for (const result of sessionChecks(messages)) {
			findings.push({ worker, caseId: `${label}/${result.name}`, ...result });
		}
	}

	return { manifest, workers, findings };
}

export function judgeableWorkers(workers) {
	return workers.filter((worker) => (worker.finalReply ?? "").trim());
}

export function renderRetroJudgePrompt(worker) {
	return RETRO_JUDGE_TEMPLATE.replace("{task}", worker.task ?? "").replace("{reply}", worker.finalReply ?? "");
}

export function parseRetroJudge(judgeText) {
	return parseScoreDescription(judgeText, { min: 0, max: 2 });
}
