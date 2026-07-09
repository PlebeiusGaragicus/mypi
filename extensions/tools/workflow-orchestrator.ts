// @ts-nocheck
/**
 * Preset-aware subagent delegation. The extension module is package-loaded, but
 * the `subagent` tool is only active for presets that declare
 * `extensions: [workflow-orchestrator]` plus a `workers:` catalog — the
 * `workflow` interpreter preset, or any conversational preset that delegates
 * bounded work (e.g. `socratic` dispatching `web` workers to find sources).
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { activePresetHasExtension, getActivePresetState } from "../../shared/presets/state";

// LM Studio serves at most 4 concurrent requests; more workers would idle in
// its queue while holding open processes and connections (docs/proposals.md P2).
const MAX_PARALLEL_TASKS = 4;
const SUBAGENT_TRACES_CUSTOM_TYPE = "mypi.subagent-traces";

type InvocationMode = "single" | "parallel" | "chain";

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

/** One rendered row in a worker's live activity feed; not persisted to the manifest. */
interface TimelineEvent {
	at: string;
	kind: "tool" | "note";
	/** Tool name, or a short label for notes. */
	label: string;
	/** Argument preview for tools, text snippet for notes. */
	detail?: string;
	durationMs?: number;
	isError?: boolean;
	/** Tools start pending and settle when tool_execution_end arrives. */
	pending?: boolean;
}

interface WorkerResult {
	index: number;
	agent: string;
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	startedAt: string;
	endedAt?: string;
	traceDir: string;
	/** Live one-line status while the worker runs; not persisted to the manifest. */
	activity?: string;
	/** Rolling feed of what the worker is doing, rendered live in the tool UI. */
	timeline: TimelineEvent[];
	/** Tail of the assistant text currently being streamed (cleared per turn). */
	streamText?: string;
	/** Characters of thinking streamed so far in the current turn. */
	streamThinkingChars?: number;
}

interface TopLevelSubagentDetails {
	mode: InvocationMode;
	traceRunId: string;
	traceDir: string;
	results: WorkerResult[];
}

interface ManifestWorker {
	index: number;
	agent: string;
	mode: InvocationMode;
	task: string;
	startedAt: string;
	endedAt?: string;
	exitCode?: number;
	finalReply?: string;
	stderr?: string;
	stopReason?: string;
	errorMessage?: string;
	model?: string;
	usage?: UsageStats;
}

interface TraceManifest {
	parentAgent: string;
	traceRunId: string;
	cwd: string;
	createdAt: string;
	workers: ManifestWorker[];
}

type OnUpdateCallback = (partial: AgentToolResult<TopLevelSubagentDetails>) => void;

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function makeRunId(parentAgent: string): string {
	const now = new Date();
	const timestamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		`${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
	].join("-");
	const suffix = randomBytes(3).toString("hex");
	return `${timestamp}--${parentAgent}-${suffix}`;
}

function encodeCwdSessionDirKey(cwd: string): string {
	return `--${path.normalize(cwd).replace(/^[/\\]+/, "").replace(/[/\\]/g, "-")}--`;
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		for (const part of msg.content) {
			if (part.type === "text") return part.text;
		}
	}
	return "";
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };
	return { command: "pi", args };
}

function buildWorkerTask(task: string): string {
	return [
		"You are running as a worker for a parent agent.",
		"Your final reply is consumed by the parent agent, not shown directly to the user.",
		"Return concise operational information: what happened, important results, artifact paths, blockers, errors, and verification notes.",
		"The user cannot answer worker questions. Complete the task from the instructions provided, make a clearly stated assumption if safe, or return a concise blocker.",
		"Do not add user-facing preamble, closing text, or broad process narration.",
		"",
		"Delegated task:",
		task,
	].join("\n");
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function spinnerFrame(): string {
	return SPINNER_FRAMES[Math.floor(Date.now() / 120) % SPINNER_FRAMES.length];
}

function fmtSeconds(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m${(seconds % 60).toString().padStart(2, "0")}s`;
}

function elapsedSince(startedAt: string): string {
	return fmtSeconds(Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000)));
}

function fmtDurationMs(ms: number): string {
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	return fmtSeconds(Math.round(ms / 1000));
}

function fmtCount(n: number): string {
	if (n < 1000) return `${n}`;
	return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

function firstLine(text: string): string {
	return text.split("\n").find((line) => line.trim()) ?? "";
}

function clip(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Concatenated text / thinking streamed so far in a (possibly partial) message. */
function messageParts(message: Message): { text: string; thinking: string } {
	let text = "";
	let thinking = "";
	for (const part of message.content ?? []) {
		if (part.type === "text") text += part.text ?? "";
		else if (part.type === "thinking") thinking += (part as { thinking?: string }).thinking ?? "";
	}
	return { text, thinking };
}

function progressLine(result: WorkerResult): string {
	if (result.endedAt) return compactResultLine(result);
	const activity = result.activity || "starting";
	return `[${result.agent}] running ${elapsedSince(result.startedAt)} · turn ${result.usage.turns + 1} · ${activity}`;
}

function currentWorkers(): string[] {
	return getActivePresetState()?.workers ?? [];
}

function workerCatalog(): string | null {
	const workers = currentWorkers();
	if (workers.length === 0) return null;
	return [
		"## Available Top-Level Capability Agents",
		"",
		"Use the `subagent` tool to delegate bounded work to these durable capability presets. Workers reply to you, not directly to the user.",
		"",
		...workers.map((worker) => `### ${worker}\n\nPreset worker launched with \`pi --preset ${worker}\`.`),
	].join("\n");
}

class TraceManager {
	private manifest: TraceManifest | null = null;
	private writeQueue: Promise<void> = Promise.resolve();
	private nextIndex = 1;
	private sessionTracePointerAppended = false;
	private traceDirAbsolute: string | null = null;

	constructor(
		readonly runId: string,
		private readonly parentAgentLabel: string,
	) {}

	get traceDir(): string {
		if (!this.traceDirAbsolute) throw new Error("TraceManager.ensure(cwd) must run before traceDir is read");
		return this.traceDirAbsolute;
	}

	private get manifestPath(): string {
		return path.join(this.traceDir, "manifest.json");
	}

	ensure(cwd: string): void {
		if (!this.traceDirAbsolute) this.traceDirAbsolute = path.join(cwd, ".pi", "subagent-traces", this.runId);
		fs.mkdirSync(this.traceDir, { recursive: true });
		if (!this.manifest) {
			this.manifest = {
				parentAgent: this.parentAgentLabel,
				traceRunId: this.runId,
				cwd,
				createdAt: new Date().toISOString(),
				workers: [],
			};
			void this.write();
		}
	}

	appendSessionTracePointerIfNeeded(pi: ExtensionAPI, cwd: string): void {
		if (this.sessionTracePointerAppended || !this.traceDirAbsolute) return;
		this.sessionTracePointerAppended = true;
		pi.appendEntry(SUBAGENT_TRACES_CUSTOM_TYPE, {
			v: 2,
			traceRunId: this.runId,
			traceDir: this.traceDirAbsolute,
			cwdSessionKey: encodeCwdSessionDirKey(cwd),
			parentAgent: this.parentAgentLabel,
		});
	}

	startWorker(mode: InvocationMode, agent: string, task: string, cwd: string) {
		this.ensure(cwd);
		const entry: ManifestWorker = {
			index: this.nextIndex++,
			agent,
			mode,
			task,
			startedAt: new Date().toISOString(),
		};
		this.manifest?.workers.push(entry);
		void this.write();
		return entry;
	}

	finishWorker(entry: ManifestWorker, result: WorkerResult): void {
		entry.endedAt = result.endedAt;
		entry.exitCode = result.exitCode;
		entry.finalReply = getFinalOutput(result.messages).slice(0, 4000);
		entry.stderr = result.stderr || undefined;
		entry.stopReason = result.stopReason;
		entry.errorMessage = result.errorMessage;
		entry.model = result.model;
		entry.usage = result.usage;
		void this.write();
	}

	async flush(): Promise<void> {
		await this.writeQueue;
	}

	private write(): Promise<void> {
		this.writeQueue = this.writeQueue
			.then(async () => {
				if (!this.manifest || !this.traceDirAbsolute) return;
				await fs.promises.mkdir(this.traceDir, { recursive: true });
				await fs.promises.writeFile(this.manifestPath, `${JSON.stringify(this.manifest, null, 2)}\n`);
			})
			.catch(() => {});
		return this.writeQueue;
	}
}

async function runWorker(
	defaultCwd: string,
	parentModel: string | undefined,
	agentName: string,
	task: string,
	mode: InvocationMode,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: WorkerResult[]) => TopLevelSubagentDetails,
	liveResults: WorkerResult[],
	traceManager: TraceManager,
): Promise<WorkerResult> {
	const allowed = currentWorkers();
	const manifestEntry = traceManager.startWorker(mode, agentName, task, defaultCwd);
	const startedAt = manifestEntry.startedAt;
	const currentResult: WorkerResult = {
		index: manifestEntry.index,
		agent: agentName,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		startedAt,
		traceDir: traceManager.traceDir,
		timeline: [],
	};
	liveResults.push(currentResult);

	if (!allowed.includes(agentName)) {
		currentResult.exitCode = 1;
		currentResult.stderr = `Unavailable worker "${agentName}". Available workers: ${allowed.join(", ") || "none"}.`;
		currentResult.endedAt = new Date().toISOString();
		traceManager.finishWorker(manifestEntry, currentResult);
		return currentResult;
	}

	// Workers inherit the parent session's model: a fresh `pi` process would
	// otherwise fall back to the global default model, so orchestrator and
	// workers could silently run different models (and thrash model loads on
	// a memory-constrained server). Preset model pins still win via activate().
	//
	// Thinking is forced off for workers: their tasks are bounded and the parent
	// session's thinking level otherwise leaks in, turning each worker turn into
	// minutes of silent local-model reasoning. A worker preset that declares its
	// own thinkingLevel still wins — preset activation applies it in-session.
	const args = ["--mode", "json", "--session-dir", traceManager.traceDir, "--preset", agentName];
	if (parentModel) args.push("--model", parentModel);
	args.push("--thinking", "off");
	args.push("-p", buildWorkerTask(task));
	let lastEmitAt = 0;
	const emitUpdate = (force = true) => {
		if (!onUpdate) return;
		const now = Date.now();
		if (!force && now - lastEmitAt < 1000) return;
		lastEmitAt = now;
		onUpdate({
			content: [{ type: "text", text: liveResults.map(progressLine).join("\n") || "(running...)" }],
			details: makeDetails(liveResults),
		});
	};
	emitUpdate();

	let wasAborted = false;
	try {
		currentResult.exitCode = await new Promise<number>((resolveExit) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_IS_SUBAGENT: "1" },
			});
			let buffer = "";
			const pendingTools = new Map<string, TimelineEvent>();
			const pushEvent = (entry: TimelineEvent) => {
				currentResult.timeline.push(entry);
				// Rolling cap so a long worker cannot bloat the session entry.
				if (currentResult.timeline.length > 200) currentResult.timeline.splice(0, currentResult.timeline.length - 200);
			};
			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: {
					type?: string;
					message?: Message;
					toolCallId?: string;
					toolName?: string;
					args?: unknown;
					isError?: boolean;
				};
				try {
					event = JSON.parse(line) as typeof event;
				} catch {
					return;
				}
				if (event.type === "tool_execution_start" && event.toolName) {
					const entry: TimelineEvent = {
						at: new Date().toISOString(),
						kind: "tool",
						label: event.toolName,
						detail: clip(JSON.stringify(event.args ?? {}), 100),
						pending: true,
					};
					pushEvent(entry);
					if (event.toolCallId) pendingTools.set(event.toolCallId, entry);
					currentResult.activity = `${entry.label} ${entry.detail}`;
					emitUpdate();
					return;
				}
				if (event.type === "tool_execution_end") {
					const entry = event.toolCallId ? pendingTools.get(event.toolCallId) : undefined;
					if (entry) {
						if (event.toolCallId) pendingTools.delete(event.toolCallId);
						entry.pending = false;
						entry.durationMs = Math.max(0, Date.now() - Date.parse(entry.at));
						entry.isError = Boolean(event.isError);
					}
					emitUpdate();
					return;
				}
				if (event.type === "message_update" && event.message?.role === "assistant") {
					// The model is streaming a turn — on slow local models this is the
					// minutes-long stretch that used to look like a hang.
					const { text, thinking } = messageParts(event.message);
					currentResult.streamText = text.slice(-400);
					currentResult.streamThinkingChars = thinking.length;
					currentResult.activity = text
						? `writing (${fmtCount(text.length)} chars)`
						: thinking
							? `thinking (${fmtCount(thinking.length)} chars)`
							: `model generating (turn ${currentResult.usage.turns + 1})`;
					emitUpdate(false);
					return;
				}
				if ((event.type === "message_end" || event.type === "tool_result_end") && event.message) {
					currentResult.messages.push(event.message);
					if (event.message.role === "assistant") {
						currentResult.usage.turns++;
						currentResult.streamText = undefined;
						currentResult.streamThinkingChars = undefined;
						const { text } = messageParts(event.message);
						if (text.trim()) {
							pushEvent({
								at: new Date().toISOString(),
								kind: "note",
								label: `turn ${currentResult.usage.turns}`,
								detail: clip(firstLine(text), 100),
							});
						}
						const usage = event.message.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && event.message.model) currentResult.model = event.message.model;
						if (event.message.stopReason) currentResult.stopReason = event.message.stopReason;
						if (event.message.errorMessage) currentResult.errorMessage = event.message.errorMessage;
					} else {
						// A tool result just landed; the next silence is model inference.
						currentResult.activity = `model turn ${currentResult.usage.turns + 1} starting`;
					}
					emitUpdate();
				}
			};
			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});
			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});
			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolveExit(code ?? 0);
			});
			proc.on("error", () => resolveExit(1));
			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});
		if (wasAborted) {
			currentResult.stopReason = "aborted";
			currentResult.errorMessage = "Worker was aborted";
		}
		return currentResult;
	} finally {
		currentResult.endedAt = new Date().toISOString();
		traceManager.finishWorker(manifestEntry, currentResult);
		await traceManager.flush();
	}
}

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the worker preset to invoke" }),
	task: Type.String({ description: "Task to delegate to the worker" }),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the worker preset to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the worker preset to invoke" })),
	task: Type.Optional(Type.String({ description: "Task to delegate in single mode" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel worker calls" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential worker calls; later tasks can use {previous}" })),
});

function isErrorResult(result: WorkerResult): boolean {
	if (result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted") return true;
	// A length stop or an empty final reply is a failed return even when the
	// process exits 0: the worker produced no usable value for the parent
	// (docs/orchestrator-research-report.md, Failure 1).
	return result.stopReason === "length" || getFinalOutput(result.messages).trim() === "";
}

function failureReason(result: WorkerResult): string {
	if (result.exitCode !== 0) return `exit ${result.exitCode}`;
	if (result.stopReason === "aborted") return "aborted";
	if (result.stopReason === "error") return "error";
	if (result.stopReason === "length") return "hit output-token limit";
	return "empty final reply";
}

function compactResultLine(result: WorkerResult): string {
	const output = getFinalOutput(result.messages).trim();
	const preview = output.length > 240 ? `${output.slice(0, 240)}...` : output;
	const status = isErrorResult(result) ? `failed (${failureReason(result)})` : "completed";
	return `[${result.agent}] ${status}: ${preview || result.stderr || "(no output)"}`;
}

export default function workflowOrchestrator(pi: ExtensionAPI): void {
	if (process.env.PI_IS_SUBAGENT === "1") return;

	const traceManager = new TraceManager(makeRunId("workflow"), "workflow");

	pi.on("before_agent_start", async (event) => {
		if (!activePresetHasExtension("workflow-orchestrator")) return undefined;
		const catalog = workerCatalog();
		if (!catalog) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${catalog}` };
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: "Delegate bounded work to worker presets declared by the active workflow preset.",
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!activePresetHasExtension("workflow-orchestrator")) {
				return {
					content: [{ type: "text", text: "subagent is not enabled for the active preset." }],
					details: { mode: "single", traceRunId: traceManager.runId, traceDir: "", results: [] },
					isError: true,
				};
			}
			const allowed = currentWorkers();
			const agentList = allowed.join(", ") || "none";
			traceManager.ensure(ctx.cwd);
			traceManager.appendSessionTracePointerIfNeeded(pi, ctx.cwd);
			const makeDetails =
				(mode: InvocationMode) =>
				(results: WorkerResult[]): TopLevelSubagentDetails => ({
					mode,
					traceRunId: traceManager.runId,
					traceDir: traceManager.traceDir,
					results,
				});

			const parentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			if (Number(hasChain) + Number(hasTasks) + Number(hasSingle) !== 1) {
				return {
					content: [{ type: "text", text: `Invalid parameters. Provide exactly one mode. Available workers: ${agentList}` }],
					details: makeDetails("single")([]),
					isError: true,
				};
			}

			if (params.chain?.length) {
				const results: WorkerResult[] = [];
				let previousOutput = "";
				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const result = await runWorker(
						ctx.cwd,
						parentModel,
						step.agent,
						step.task.replace(/\{previous\}/g, previousOutput),
						"chain",
						signal,
						onUpdate,
						makeDetails("chain"),
						results,
						traceManager,
					);
					if (isErrorResult(result)) {
						const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}, ${failureReason(result)}): ${errorMsg}` }],
							details: makeDetails("chain")(results),
							isError: true,
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}
				return {
					content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
					details: makeDetails("chain")(results),
				};
			}

			if (params.tasks?.length) {
				if (params.tasks.length > MAX_PARALLEL_TASKS) {
					return {
						content: [{ type: "text", text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
						details: makeDetails("parallel")([]),
						isError: true,
					};
				}
				const live: WorkerResult[] = [];
				const results = await Promise.all(
					params.tasks.map((task) =>
						runWorker(ctx.cwd, parentModel, task.agent, task.task, "parallel", signal, onUpdate, makeDetails("parallel"), live, traceManager),
					),
				);
				const successCount = results.filter((result) => !isErrorResult(result)).length;
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded\n\n${results.map(compactResultLine).join("\n\n")}`,
						},
					],
					details: makeDetails("parallel")(results),
					isError: successCount !== results.length,
				};
			}

			if (params.agent && params.task) {
				const result = await runWorker(ctx.cwd, parentModel, params.agent, params.task, "single", signal, onUpdate, makeDetails("single"), [], traceManager);
				if (isErrorResult(result)) {
					const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
					return {
						content: [{ type: "text", text: `Worker failed (${failureReason(result)}): ${errorMsg}` }],
						details: makeDetails("single")([result]),
						isError: true,
					};
				}
				return {
					content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
					details: makeDetails("single")([result]),
				};
			}

			return {
				content: [{ type: "text", text: `Invalid parameters. Available workers: ${agentList}` }],
				details: makeDetails("single")([]),
				isError: true,
			};
		},

		renderCall(args, theme) {
			const title = theme.fg("toolTitle", theme.bold("subagent"));
			if (args.tasks?.length) {
				const lines = args.tasks
					.slice(0, 4)
					.map((t: { agent?: string; task?: string }, i: number) => `  ${theme.fg("dim", `${i + 1}.`)} ${theme.fg("accent", t.agent ?? "?")} ${theme.fg("dim", clip(String(t.task ?? ""), 80))}`);
				return new Text(`${title} ${theme.fg("accent", `×${args.tasks.length} parallel`)}\n${lines.join("\n")}`, 0, 0);
			}
			if (args.chain?.length) {
				const hops = args.chain.map((t: { agent?: string }) => t.agent ?? "?").join(" → ");
				return new Text(`${title} ${theme.fg("accent", `chain ${hops}`)}\n  ${theme.fg("dim", clip(String(args.chain[0]?.task ?? ""), 80))}`, 0, 0);
			}
			return new Text(`${title} ${theme.fg("accent", `${args.agent || ""}`)}\n  ${theme.fg("dim", clip(String(args.task ?? "…"), 100))}`, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as TopLevelSubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}
			const mdTheme = getMarkdownTheme();
			const container = new Container();
			const gutter = (line: string) => new Text(`${theme.fg("dim", "│")} ${line}`, 0, 0);

			const timelineRow = (ev: TimelineEvent): string => {
				if (ev.kind === "note") {
					return `${theme.fg("muted", "✎")} ${theme.fg("dim", ev.label)} ${theme.fg("muted", `“${ev.detail ?? ""}”`)}`;
				}
				const suffix = ev.pending
					? theme.fg("accent", spinnerFrame())
					: ev.isError
						? theme.fg("error", "✗") + (ev.durationMs != null ? theme.fg("dim", ` ${fmtDurationMs(ev.durationMs)}`) : "")
						: theme.fg("success", "✓") + (ev.durationMs != null ? theme.fg("dim", ` ${fmtDurationMs(ev.durationMs)}`) : "");
				return `${theme.fg("accent", "✱")} ${theme.fg("toolTitle", ev.label)} ${theme.fg("dim", ev.detail ?? "")} ${suffix}`;
			};

			for (const worker of details.results) {
				// endedAt is unset while the worker is still streaming; an empty reply
				// only counts as an error once the process has finished.
				const running = !worker.endedAt;
				const failed = !running && isErrorResult(worker);
				const usage = worker.usage;

				if (worker !== details.results[0]) container.addChild(new Spacer(1));

				const icon = running ? theme.fg("accent", spinnerFrame()) : failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const stats = running
					? `running ${elapsedSince(worker.startedAt)} · turn ${usage.turns + 1}${usage.contextTokens ? ` · ${fmtCount(usage.contextTokens)} ctx` : ""}`
					: [
							failed ? failureReason(worker) : null,
							`${usage.turns} ${usage.turns === 1 ? "turn" : "turns"}`,
							worker.endedAt ? fmtSeconds(Math.max(0, Math.round((Date.parse(worker.endedAt) - Date.parse(worker.startedAt)) / 1000))) : null,
							usage.input ? `in ${fmtCount(usage.input)}` : null,
							usage.output ? `out ${fmtCount(usage.output)}` : null,
							usage.cost ? `$${usage.cost.toFixed(4)}` : null,
						]
							.filter(Boolean)
							.join(" · ");
				container.addChild(
					new Text(`${theme.fg("dim", "╭─")} ${icon} ${theme.bold(theme.fg(failed ? "error" : "toolTitle", worker.agent))} ${theme.fg("dim", stats)}`, 0, 0),
				);
				if (expanded && worker.model) container.addChild(gutter(theme.fg("muted", worker.model)));

				// Sessions saved before timelines existed deserialize without one.
				const timeline = worker.timeline ?? [];
				const visible = expanded ? timeline : timeline.slice(-4);
				const hidden = timeline.length - visible.length;
				if (hidden > 0) container.addChild(gutter(theme.fg("muted", `… ${hidden} earlier ${hidden === 1 ? "step" : "steps"} (Ctrl+O)`)));
				for (const ev of visible) container.addChild(gutter(timelineRow(ev)));

				if (running) {
					container.addChild(gutter(`${theme.fg("accent", spinnerFrame())} ${theme.fg("dim", worker.activity || "starting")}`));
					const tail = worker.streamText?.trim();
					if (tail) {
						const preview = clip(tail.slice(-(expanded ? 360 : 140)), expanded ? 360 : 140);
						container.addChild(gutter(theme.fg("muted", `▏ …${preview}`)));
					}
					container.addChild(new Text(theme.fg("dim", "╰─"), 0, 0));
					continue;
				}

				const output = getFinalOutput(worker.messages).trim();
				if (output) {
					container.addChild(new Text(`${theme.fg("dim", "├─")} ${theme.fg("muted", "reply")}`, 0, 0));
					const shown = expanded ? output : output.split("\n").slice(0, 8).join("\n");
					container.addChild(new Markdown(shown, 0, 0, mdTheme));
					if (!expanded && output.split("\n").length > 8) {
						container.addChild(new Text(theme.fg("muted", "(Ctrl+O to expand)"), 0, 0));
					}
				} else if (worker.errorMessage || worker.stderr.trim()) {
					container.addChild(gutter(theme.fg("error", clip(worker.errorMessage || worker.stderr, expanded ? 600 : 200))));
				} else {
					container.addChild(gutter(theme.fg("muted", "(no output)")));
				}
				container.addChild(new Text(theme.fg("dim", "╰─"), 0, 0));
			}

			container.addChild(
				new Text(theme.fg("muted", `  trace ${details.traceRunId}${expanded ? ` · ${details.traceDir}` : ""}`), 0, 0),
			);
			return container;
		},
	});
}
