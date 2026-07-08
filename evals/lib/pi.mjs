// Controlled single-turn pi invocation for benchmark evals.
//
// Every call runs with tools, skills, prompt templates, context files,
// extensions, and session persistence disabled, so the only inputs the model
// sees are the system prompt and the question — see docs/proposals.md P6.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

function piArgs({ prompt, systemPrompt, model, thinking }) {
	return [
		"--mode",
		"json",
		"--no-tools",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-extensions",
		"--no-session",
		"--model",
		model,
		"--thinking",
		thinking || "off",
		"--system-prompt",
		systemPrompt,
		"-p",
		prompt,
	];
}

function textFromMessage(message) {
	const chunks = [];
	for (const item of message.content ?? []) {
		if (item && typeof item === "object" && item.type === "text") chunks.push(String(item.text ?? ""));
	}
	return chunks.join("\n").trim();
}

function compactMetadata(message) {
	const metadata = {};
	for (const field of ["api", "provider", "model", "usage", "stopReason", "timestamp", "errorMessage"]) {
		if (field in message) metadata[field] = message[field];
	}
	return metadata;
}

// The json mode stream is one event per line; the answer is the final
// assistant message_end event.
function parseFinalOutput(stdout) {
	let finalMessage = null;
	let eventCount = 0;
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		eventCount++;
		let event;
		try {
			event = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (event?.type !== "message_end") continue;
		const message = event.message ?? {};
		if (message.role === "assistant") finalMessage = message;
	}
	if (!finalMessage) return { text: "", metadata: {}, event_count: eventCount };
	return { text: textFromMessage(finalMessage), metadata: compactMetadata(finalMessage), event_count: eventCount };
}

function writeArtifacts(artifactDir, { args, output, stderr, textFile }) {
	mkdirSync(artifactDir, { recursive: true });
	writeFileSync(path.join(artifactDir, "args.json"), `${JSON.stringify(args, null, 2)}\n`);
	writeFileSync(path.join(artifactDir, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
	writeFileSync(path.join(artifactDir, textFile), `${output.text ?? ""}\n`);
	writeFileSync(path.join(artifactDir, "stderr.txt"), stderr ?? "");
}

function previewText(text, max = 200) {
	const flat = String(text).replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

// One terse narration line per meaningful json-mode event, so a multi-minute
// workflow run is visibly alive in the terminal instead of silent.
function progressLinesFromEvent(line) {
	let event;
	try {
		event = JSON.parse(line);
	} catch {
		return [];
	}
	if (event?.type !== "message_end") return [];
	const message = event.message ?? {};
	const lines = [];
	if (message.role === "assistant") {
		for (const item of message.content ?? []) {
			if (!item || typeof item !== "object") continue;
			if (item.type === "text" && String(item.text ?? "").trim()) lines.push(`orchestrator: ${previewText(item.text)}`);
			if (item.type === "toolCall") lines.push(`tool ${item.name}: ${previewText(JSON.stringify(item.arguments ?? {}), 160)}`);
		}
	} else if (message.role === "toolResult") {
		const text = (message.content ?? [])
			.filter((item) => item && typeof item === "object" && item.type === "text")
			.map((item) => String(item.text ?? ""))
			.join(" ");
		lines.push(`  -> ${message.isError ? "error: " : ""}${previewText(text, 160) || "(no output)"}`);
	}
	return lines;
}

// Full-capability workflow invocation: unlike benchmark calls, the preset,
// extensions (subagent tool), skills, and tools all stay enabled — this IS
// the system under test. Runs in `cwd` (a fresh workspace) so artifacts and
// subagent traces land there. Streams progress lines to `onProgress` as the
// orchestrator works, and forwards Ctrl-C to pi so an interrupted run still
// gets its artifacts written (and pi never outlives its stdout pipe).
export function runPiWorkflow({ prompt, preset, model, cwd, sessionDir, artifactDir, onProgress }) {
	const args = ["--mode", "json", "--preset", preset, "--model", model, "--session-dir", sessionDir, "-p", prompt];
	const started = process.hrtime.bigint();

	return new Promise((resolve) => {
		// Intentionally no timeout: workflow runs take as long as they take.
		const proc = spawn("pi", args, { cwd, stdio: ["ignore", "pipe", "inherit"] });

		let stdout = "";
		let pending = "";
		let interrupted = false;
		const onSigint = () => {
			if (interrupted) {
				proc.kill("SIGKILL");
				return;
			}
			interrupted = true;
			onProgress?.("interrupt received, stopping pi (Ctrl-C again to force quit)...");
			proc.kill("SIGINT");
		};
		process.on("SIGINT", onSigint);

		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (chunk) => {
			if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk;
			if (!onProgress) return;
			pending += chunk;
			let newline;
			while ((newline = pending.indexOf("\n")) >= 0) {
				const line = pending.slice(0, newline);
				pending = pending.slice(newline + 1);
				for (const progressLine of progressLinesFromEvent(line)) onProgress(progressLine);
			}
		});

		const finish = (result) => {
			process.removeListener("SIGINT", onSigint);
			resolve(result);
		};

		proc.on("error", (error) => {
			const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
			const output = { text: "", metadata: {}, event_count: 0, elapsed_seconds: elapsedSeconds };
			writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: String(error), textFile: "final-reply.txt" });
			finish({ exitCode: 1, text: "", errorMessage: `failed to launch pi: ${error.message}`, elapsedSeconds });
		});

		proc.on("close", (code, signal) => {
			const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
			const output = parseFinalOutput(stdout);
			output.elapsed_seconds = elapsedSeconds;
			writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: "", textFile: "final-reply.txt" });
			const exitCode = code ?? 1;
			const errorMessage = interrupted
				? "interrupted by user (Ctrl-C)"
				: output.metadata.stopReason === "error"
					? String(output.metadata.errorMessage || "orchestrator stopped with an error")
					: exitCode !== 0
						? `pi exited with ${signal ? `signal ${signal}` : `code ${exitCode}`}`
						: "";
			finish({ exitCode: errorMessage && exitCode === 0 ? 1 : exitCode, text: output.text, errorMessage, elapsedSeconds });
		});
	});
}

export function runPi({ prompt, systemPrompt, model, thinking, artifactDir, dryRunText = null, textFile = "answer.txt" }) {
	const args = piArgs({ prompt, systemPrompt, model, thinking });
	const started = process.hrtime.bigint();

	if (dryRunText !== null) {
		const output = { text: dryRunText, metadata: { dry_run: true }, event_count: 1, elapsed_seconds: 0 };
		writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: "[dry-run]\n", textFile });
		return { exitCode: 0, text: dryRunText, errorMessage: "", elapsedSeconds: 0 };
	}

	// Intentionally no timeout: local models can take minutes per answer.
	const proc = spawnSync("pi", args, {
		encoding: "utf8",
		maxBuffer: MAX_STDOUT_BYTES,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;

	if (proc.error) {
		const output = { text: "", metadata: {}, event_count: 0, elapsed_seconds: elapsedSeconds };
		writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: String(proc.error), textFile });
		return { exitCode: 1, text: "", errorMessage: `failed to launch pi: ${proc.error.message}`, elapsedSeconds };
	}

	const output = parseFinalOutput(proc.stdout ?? "");
	output.elapsed_seconds = elapsedSeconds;
	writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: proc.stderr ?? "", textFile });

	let exitCode = proc.status ?? 0;
	let errorMessage = "";
	if (output.metadata.stopReason === "error") {
		errorMessage = String(output.metadata.errorMessage || "model stopped with an error");
		if (exitCode === 0) exitCode = 1;
	} else if (exitCode !== 0) {
		errorMessage = (proc.stderr ?? "").trim() || `pi exited with code ${exitCode}`;
	} else if (!output.text) {
		exitCode = 1;
		errorMessage = "pi produced no assistant text";
	}
	return { exitCode, text: output.text, errorMessage, elapsedSeconds };
}
