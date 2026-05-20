export interface ActivePresetState {
	name: string;
	description?: string;
	extensions: string[];
	workers: string[];
}

let activePreset: ActivePresetState | null = null;

export function setActivePresetState(next: ActivePresetState | null): void {
	activePreset = next;
}

export function getActivePresetState(): ActivePresetState | null {
	return activePreset;
}

export function activePresetHasExtension(extensionId: string): boolean {
	return activePreset?.extensions.includes(extensionId) ?? false;
}
