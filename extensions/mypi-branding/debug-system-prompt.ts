declare const process: {
	stdout: {
		write(chunk: string, callback?: () => void): boolean;
	};
	exit(code?: number): never;
};

type ExtensionAPI = {
	registerFlag(
		name: string,
		options: {
			description?: string;
			type: "boolean" | "string";
			default?: boolean | string;
		},
	): void;
	getFlag(name: string): boolean | string | undefined;
	on(
		event: "before_agent_start",
		handler: (event: DebugSystemPromptEvent) => Promise<undefined> | undefined,
	): void;
};

type DebugSystemPromptEvent = {
	prompt: string;
	systemPrompt: string;
};

export function registerDebugSystemPrompt(pi: ExtensionAPI): void {
	pi.registerFlag("debug-system-prompt", {
		type: "boolean",
		default: false,
		description: "Print the effective system prompt for the turn and exit before calling the model",
	});

	pi.on("before_agent_start", async (event) => {
		const enabled = pi.getFlag("debug-system-prompt");
		if (enabled !== true && enabled !== "true") return undefined;

		const ev = event as DebugSystemPromptEvent;
		process.stdout.write(
			`${JSON.stringify(
				{
					type: "debug_system_prompt",
					preset: pi.getFlag("preset") || null,
					prompt: ev.prompt,
					systemPrompt: ev.systemPrompt,
				},
				null,
				2,
			)}\n`,
		);
		process.exit(0);
	});
}
