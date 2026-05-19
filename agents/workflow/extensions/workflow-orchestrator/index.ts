/**
 * Workflow orchestrator — registers the `subagent` tool and worker traces for MAS workflow mode.
 * Worker names match agent-mode profiles; each resolves to `agents/<name>/` under the package root.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** Subagent `agent` field values — same ids as `/agent-mode` profiles (`agents/<name>/`). */
const CORE_AGENT_NAMES = ["chat", "scout", "write", "code", "web"] as const;
type CoreAgentName = (typeof CORE_AGENT_NAMES)[number];

const MAX_PARALLEL_TASKS = 100;

type InvocationMode = "single" | "parallel" | "chain";

interface CapabilityAgent {
	name: CoreAgentName;
	dir: string;
	capability?: string;
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface WorkerResult {
	index: number;
	agent: string;
	persona?: string;
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
	persona: string | null;
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
	const normalized = path.normalize(cwd);
	const noLeading = normalized.replace(/^[/\\]+/, "");
	const encoded = noLeading.replace(/[/\\]/g, "-");
	return `--${encoded}--`;
}

function readCapability(agentDir: string): string | undefined {
	const capabilityPath = path.join(agentDir, "CAPABILITY.md");
	try {
		const raw = fs.readFileSync(capabilityPath, "utf-8").trim();
		return raw || undefined;
	} catch {
		return undefined;
	}
}

function loadCapabilityAgents(): CapabilityAgent[] {
	return CORE_AGENT_NAMES.map((name) => {
		const dir = path.join(PACKAGE_ROOT, "agents", name);
		return {
			name,
			dir,
			capability: readCapability(dir),
		};
	});
}

function buildCapabilityCatalog(agents: CapabilityAgent[]): string | null {
	const sections = agents
		.filter((agent) => agent.capability)
		.map((agent) => `### ${agent.name}\n\n${agent.capability}`);
	if (sections.length === 0) return null;
	return [
		"## Available Top-Level Capability Agents",
		"",
		"Use the `subagent` tool to delegate bounded work to these durable capability agents. Workers reply to the orchestrator, not directly to the user.",
		"",
		...sections,
	].join("\n");
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
		"You are running as a worker for a parent MAS orchestrator.",
		"Your final reply is consumed by the orchestrator, not shown directly to the user.",
		"Return only concise operational information the orchestrator needs: what happened, important results, artifact paths, blockers, errors, and verification notes.",
		"The user cannot answer worker questions. Complete the task from the instructions provided, make a clearly stated assumption if safe, or return a concise blocker.",
		"Do not add user-facing preamble, closing text, or broad process narration.",
		"",
		"Delegated task:",
		task,
	].join("\n");
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

const PI_AGENT_CONFIG_NAMES = ["models.json", "auth.json"] as const;

/**
 * Symlink `~/.pi/agent/{models,auth}.json` into `agentDir` so child `pi` (with `PI_CODING_AGENT_DIR`) loads the
 * same provider config as the interactive CLI. Unix only. Does not replace an existing regular file in the repo.
 */
function ensurePiAgentConfigSymlinks(agentDir: string): string {
	const globalDir = path.join(homedir(), ".pi", "agent");
	let warnings = "";

	for (const name of PI_AGENT_CONFIG_NAMES) {
		const src = path.resolve(path.join(globalDir, name));
		const dst = path.join(agentDir, name);
		try {
			if (!fs.existsSync(src)) continue;

			if (!fs.existsSync(dst)) {
				fs.symlinkSync(src, dst);
				continue;
			}

			const st = fs.lstatSync(dst);
			if (st.isSymbolicLink()) {
				const linkTarget = path.resolve(agentDir, fs.readlinkSync(dst));
				if (path.resolve(linkTarget) === path.resolve(src)) continue;
				fs.unlinkSync(dst);
				fs.symlinkSync(src, dst);
				continue;
			}

			/* Existing file or directory — leave it (do not clobber). */
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			warnings += `[${name}] symlink: ${msg}\n`;
		}
	}

	return warnings;
}

/** Session custom entry — links orchestrator JSONL to this trace bundle (absolute `traceDir`). */
const SUBAGENT_TRACES_CUSTOM_TYPE = "mypi.subagent-traces";

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
		if (!this.traceDirAbsolute) {
			throw new Error("TraceManager.ensure(cwd) must run before traceDir is read");
		}
		return this.traceDirAbsolute;
	}

	private get manifestPath(): string {
		return path.join(this.traceDir, "manifest.json");
	}

	ensure(cwd: string): void {
		if (!this.traceDirAbsolute) {
			this.traceDirAbsolute = path.join(cwd, ".pi", "subagent-traces", this.runId);
		}
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
		if (this.sessionTracePointerAppended) return;
		this.sessionTracePointerAppended = true;
		const traceDir = this.traceDirAbsolute;
		if (!traceDir) return;
		try {
			pi.appendEntry(SUBAGENT_TRACES_CUSTOM_TYPE, {
				v: 2,
				traceRunId: this.runId,
				traceDir,
				cwdSessionKey: encodeCwdSessionDirKey(cwd),
				parentAgent: this.parentAgentLabel,
			});
		} catch {
			/* best-effort */
		}
	}

	startWorker(mode: InvocationMode, agent: string, persona: string | undefined, task: string, cwd: string): ManifestWorker {
		this.ensure(cwd);
		const entry: ManifestWorker = {
			index: this.nextIndex++,
			agent,
			persona: persona ?? null,
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
	agents: CapabilityAgent[],
	agentName: string,
	persona: string | undefined,
	task: string,
	mode: InvocationMode,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: WorkerResult[]) => TopLevelSubagentDetails,
	traceManager: TraceManager,
): Promise<WorkerResult> {
	const agent = agents.find((a) => a.name === agentName);
	const manifestEntry = traceManager.startWorker(mode, agentName, persona, task, defaultCwd);
	const startedAt = manifestEntry.startedAt;

	const baseResult: WorkerResult = {
		index: manifestEntry.index,
		agent: agentName,
		persona,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		startedAt,
		traceDir: traceManager.traceDir,
	};

	if (!agent || !isDirectory(agent.dir)) {
		const available = agents.filter((a) => isDirectory(a.dir)).map((a) => `"${a.name}"`).join(", ") || "none";
		const result = {
			...baseResult,
			exitCode: 1,
			stderr: `Unknown or unavailable top-level agent: "${agentName}". Available agents: ${available}.`,
			endedAt: new Date().toISOString(),
		};
		traceManager.finishWorker(manifestEntry, result);
		return result;
	}

	const linkWarnings = ensurePiAgentConfigSymlinks(agent.dir);
	if (linkWarnings) baseResult.stderr += linkWarnings;

	const args: string[] = ["--mode", "json", "--session-dir", traceManager.traceDir];
	if (persona) args.push("--persona", persona);
	args.push("-p", buildWorkerTask(task));

	const currentResult = baseResult;
	const emitUpdate = () => {
		onUpdate?.({
			content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
			details: makeDetails([currentResult]),
		});
	};

	let wasAborted = false;
	try {
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_CODING_AGENT_DIR: agent.dir, PI_IS_SUBAGENT: "1" },
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: { type?: string; message?: Message };
				try {
					event = JSON.parse(line) as { type?: string; message?: Message };
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message;
					currentResult.messages.push(msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message);
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
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

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

		currentResult.exitCode = exitCode;
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
	agent: Type.String({ description: "Name of the top-level capability agent to invoke" }),
	persona: Type.Optional(Type.String({ description: "Optional invocation persona for this worker" })),
	task: Type.String({ description: "Task to delegate to the worker" }),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the top-level capability agent to invoke" }),
	persona: Type.Optional(Type.String({ description: "Optional invocation persona for this worker" })),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the top-level capability agent to invoke" })),
	persona: Type.Optional(Type.String({ description: "Optional invocation persona for single mode" })),
	task: Type.Optional(Type.String({ description: "Task to delegate in single mode" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel worker calls" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential worker calls; later tasks can use {previous}" })),
});

function isErrorResult(result: WorkerResult): boolean {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

function compactResultLine(result: WorkerResult): string {
	const output = getFinalOutput(result.messages).trim();
	const preview = output.length > 240 ? `${output.slice(0, 240)}...` : output;
	const persona = result.persona ? `/${result.persona}` : "";
	return `[${result.agent}${persona}] ${isErrorResult(result) ? "failed" : "completed"}: ${preview || result.stderr || "(no output)"}`;
}

export default function workflowOrchestrator(pi: ExtensionAPI): void {
	if (process.env.PI_IS_SUBAGENT === "1") return;

	const traceManager = new TraceManager(makeRunId("workflow"), "workflow");

	pi.on("before_agent_start", async (event) => {
		const catalog = buildCapabilityCatalog(loadCapabilityAgents());
		if (!catalog) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${catalog}` };
	});

	const agentList = CORE_AGENT_NAMES.join(", ");

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate bounded work to top-level capability agents (mypi package profiles).",
			"Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
			`Allowed agent names (same as /agent-mode profiles): ${agentList}.`,
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agents = loadCapabilityAgents();
			traceManager.ensure(ctx.cwd);
			const makeDetails =
				(mode: InvocationMode) =>
				(results: WorkerResult[]): TopLevelSubagentDetails => ({
					mode,
					traceRunId: traceManager.runId,
					traceDir: traceManager.traceDir,
					results,
				});

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			if (modeCount !== 1) {
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode. Available agents: ${agentList}`,
						},
					],
					details: makeDetails("single")([]),
					isError: true,
				};
			}

			traceManager.appendSessionTracePointerIfNeeded(pi, ctx.cwd);

			if (params.chain && params.chain.length > 0) {
				const results: WorkerResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									onUpdate({
										content: partial.content,
										details: makeDetails("chain")([...results, currentResult]),
									});
								}
							}
						: undefined;

					const result = await runWorker(
						ctx.cwd,
						agents,
						step.agent,
						step.persona,
						taskWithContext,
						"chain",
						signal,
						chainUpdate,
						makeDetails("chain"),
						traceManager,
					);
					results.push(result);

					if (isErrorResult(result)) {
						const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
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

			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > MAX_PARALLEL_TASKS) {
					return {
						content: [{ type: "text", text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
						details: makeDetails("parallel")([]),
						isError: true,
					};
				}

				const allResults: WorkerResult[] = [];
				const emitParallelUpdate = () => {
					onUpdate?.({
						content: [{ type: "text", text: `Parallel: ${allResults.length}/${params.tasks?.length ?? 0} completed...` }],
						details: makeDetails("parallel")([...allResults]),
					});
				};

				const results = await Promise.all(
					params.tasks.map(async (task) => {
						const result = await runWorker(
							ctx.cwd,
							agents,
							task.agent,
							task.persona,
							task.task,
							"parallel",
							signal,
							undefined,
							makeDetails("parallel"),
							traceManager,
						);
						allResults.push(result);
						emitParallelUpdate();
						return result;
					}),
				);

				const successCount = results.filter((r) => !isErrorResult(r)).length;
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
				const result = await runWorker(
					ctx.cwd,
					agents,
					params.agent,
					params.persona,
					params.task,
					"single",
					signal,
					onUpdate,
					makeDetails("single"),
					traceManager,
				);
				if (isErrorResult(result)) {
					const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
					return {
						content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
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
				content: [{ type: "text", text: `Invalid parameters. Available agents: ${agentList}` }],
				details: makeDetails("single")([]),
				isError: true,
			};
		},

		renderCall(args, theme, _context) {
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `chain (${args.chain.length} steps)`);
				for (const [index, step] of args.chain.slice(0, 3).entries()) {
					const persona = step.persona ? `/${step.persona}` : "";
					const preview = step.task.replace(/\{previous\}/g, "").trim();
					text += `\n  ${theme.fg("muted", `${index + 1}.`)} ${theme.fg("accent", `${step.agent}${persona}`)} ${theme.fg("dim", preview.slice(0, 48))}`;
				}
				if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `parallel (${args.tasks.length} tasks)`);
				for (const task of args.tasks.slice(0, 3)) {
					const persona = task.persona ? `/${task.persona}` : "";
					text += `\n  ${theme.fg("accent", `${task.agent}${persona}`)} ${theme.fg("dim", String(task.task ?? "").slice(0, 48))}`;
				}
				if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			const persona = args.persona ? `/${args.persona}` : "";
			const preview = args.task ? String(args.task).slice(0, 72) : "...";
			return new Text(
				theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `${args.agent || "..."}${persona}`) +
					`\n  ${theme.fg("dim", preview)}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TopLevelSubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();
			const container = new Container();
			container.addChild(
				new Text(
					`${theme.fg("toolTitle", theme.bold("trace"))} ${theme.fg("accent", details.traceRunId)} ${theme.fg("dim", details.traceDir)}`,
					0,
					0,
				),
			);

			for (const worker of details.results) {
				const status = isErrorResult(worker) ? theme.fg("error", "[error]") : theme.fg("success", "[ok]");
				const persona = worker.persona ? `/${worker.persona}` : "";
				container.addChild(new Spacer(1));
				container.addChild(new Text(`${status} ${theme.fg("toolTitle", `${worker.agent}${persona}`)}`, 0, 0));
				const output = getFinalOutput(worker.messages).trim() || worker.stderr.trim() || "(no output)";
				const shown = expanded ? output : output.split("\n").slice(0, 8).join("\n");
				container.addChild(new Markdown(shown, 0, 0, mdTheme));
				if (!expanded && output.split("\n").length > 8) {
					container.addChild(new Text(theme.fg("muted", "(Ctrl+O to expand)"), 0, 0));
				}
			}

			return container;
		},
	});
}
