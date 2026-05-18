import "./bootstrap-path";
import "./bootstrap-browser";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerAgentMode from "./agent-mode";

/**
 * PATH bootstrap (skill scripts) then `/agent-mode` and related hooks.
 * Keeps modules split; compose here (same pattern as `mypi-branding/index.ts`).
 */
export default function agentModeBundle(pi: ExtensionAPI): void {
	registerAgentMode(pi);
}
