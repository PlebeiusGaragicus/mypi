// Controlled single-turn pi invocation for benchmark evals.
//
// Every call runs with tools, skills, prompt templates, context files,
// extensions, and session persistence disabled, so the only inputs the model
// sees are the system prompt and the question — see docs/proposals.md P6.

import { spawnSync } from "node:child_process";
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

function writeArtifacts(artifactDir, { args, output, stderr }) {
	mkdirSync(artifactDir, { recursive: true });
	writeFileSync(path.join(artifactDir, "args.json"), `${JSON.stringify(args, null, 2)}\n`);
	writeFileSync(path.join(artifactDir, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
	writeFileSync(path.join(artifactDir, "answer.txt"), `${output.text ?? ""}\n`);
	writeFileSync(path.join(artifactDir, "stderr.txt"), stderr ?? "");
}

export function runPi({ prompt, systemPrompt, model, thinking, artifactDir, dryRunText = null }) {
	const args = piArgs({ prompt, systemPrompt, model, thinking });
	const started = process.hrtime.bigint();

	if (dryRunText !== null) {
		const output = { text: dryRunText, metadata: { dry_run: true }, event_count: 1, elapsed_seconds: 0 };
		writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: "[dry-run]\n" });
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
		writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: String(proc.error) });
		return { exitCode: 1, text: "", errorMessage: `failed to launch pi: ${proc.error.message}`, elapsedSeconds };
	}

	const output = parseFinalOutput(proc.stdout ?? "");
	output.elapsed_seconds = elapsedSeconds;
	writeArtifacts(artifactDir, { args: ["pi", ...args], output, stderr: proc.stderr ?? "" });

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
