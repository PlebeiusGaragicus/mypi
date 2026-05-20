import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	applyRuntimeEnv,
	ensureRuntimeEnvFile,
	readRuntimeEnv,
	resolveRuntimeEnvPath,
	runtimeEnvKeys,
	writeRuntimeEnv,
} from "../../shared/runtime-env/index.js";

function splitArgs(input: string): string[] {
	const out: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const char of input.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				out.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (current) out.push(current);
	return out;
}

function visibleValue(key: string, value: string): string {
	if (!value) return "<unset>";
	if (key.includes("PASSWORD") || key.endsWith("API_KEY")) return "<set>";
	return value;
}

function usage(ctx: ExtensionCommandContext): void {
	ctx.ui.notify(
		[
			"Usage: /mypi-env-config [path|list|init|get KEY|set KEY VALUE|unset KEY]",
			`Config: ${resolveRuntimeEnvPath()}`,
		].join("\n"),
		"info",
	);
}

function setRuntimeEnvValue(key: string, value: string): void {
	const env = readRuntimeEnv();
	env[key] = value;
	writeRuntimeEnv(env);
	if (value) process.env[key] = value;
	else delete process.env[key];
	applyRuntimeEnv();
}

async function interactiveEdit(ctx: ExtensionCommandContext): Promise<void> {
	const env = readRuntimeEnv();
	const keys = [...new Set([...runtimeEnvKeys(), ...Object.keys(env).sort()])];
	const rows = [
		...keys.map((key) => `${key} = ${visibleValue(key, env[key] ?? "")}`),
		"Show path",
	];
	const choice = await ctx.ui.select("mypi.env", rows);
	if (!choice) return;
	if (choice === "Show path") {
		ctx.ui.notify(resolveRuntimeEnvPath(), "info");
		return;
	}
	const key = choice.split(" = ", 1)[0];
	const value = await ctx.ui.input(`Value for ${key} (empty unsets)`);
	if (value === undefined || value === null) return;
	setRuntimeEnvValue(key, value.trim());
	ctx.ui.notify(value.trim() ? `${key} updated` : `${key} unset`, "info");
}

export function registerMypiEnvConfig(pi: ExtensionAPI): void {
	pi.registerCommand("mypi-env-config", {
		description: "View or edit ~/.pi/mypi/mypi.env runtime settings",
		getArgumentCompletions: (prefix) => {
			const base = ["path", "list", "init", "get", "set", "unset"];
			const completions = base.filter((item) => item.startsWith(prefix));
			return completions.length ? completions.map((value) => ({ value })) : null;
		},
		handler: async (args, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) return;
			const trimmed = args.trim();
			if (!trimmed) {
				await interactiveEdit(ctx);
				return;
			}
			const [command, key, ...rest] = splitArgs(trimmed);
			if (command === "path") {
				ctx.ui.notify(resolveRuntimeEnvPath(), "info");
				return;
			}
			if (command === "init") {
				ctx.ui.notify(`mypi.env: ${ensureRuntimeEnvFile()}`, "info");
				return;
			}
			if (command === "list") {
				const env = readRuntimeEnv();
				const keys = [...new Set([...runtimeEnvKeys(), ...Object.keys(env).sort()])];
				const lines = keys.map((item) => `${item}=${visibleValue(item, env[item] ?? "")}`);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			if ((command === "get" || command === "set" || command === "unset") && !key) {
				usage(ctx);
				return;
			}
			if (command === "get") {
				const env = readRuntimeEnv();
				ctx.ui.notify(`${key}=${env[key] ?? ""}`, "info");
				return;
			}
			if (command === "set") {
				const value = rest.join(" ");
				setRuntimeEnvValue(key, value);
				ctx.ui.notify(value ? `${key} updated` : `${key} unset`, "info");
				return;
			}
			if (command === "unset") {
				setRuntimeEnvValue(key, "");
				ctx.ui.notify(`${key} unset`, "info");
				return;
			}
			usage(ctx);
		},
	});
}
