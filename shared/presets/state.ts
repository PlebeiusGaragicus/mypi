export interface ActivePresetState {
	name: string;
	description?: string;
	extensions: string[];
	workers: string[];
}

// Pi loads each extension entry with its own module graph (a fresh jiti
// instance per file with moduleCache disabled), so a module-level variable
// here would give every extension a private copy: the preset extension's
// writes would never be seen by the subagent/questionnaire tools. Anchor the
// state on globalThis so all copies of this module share one slot per process.
const GLOBAL_KEY = Symbol.for("mypi.presets.activePresetState");

interface ActivePresetStateSlot {
	current: ActivePresetState | null;
}

const slot: ActivePresetStateSlot = ((globalThis as Record<symbol, unknown>)[GLOBAL_KEY] ??= {
	current: null,
}) as ActivePresetStateSlot;

export function setActivePresetState(next: ActivePresetState | null): void {
	slot.current = next;
}

export function getActivePresetState(): ActivePresetState | null {
	return slot.current;
}

export function activePresetHasExtension(extensionId: string): boolean {
	return slot.current?.extensions.includes(extensionId) ?? false;
}
