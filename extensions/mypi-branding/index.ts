import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFlowTitle } from "./flow-title";
import { registerRainbowEditor } from "./rainbow-editor";

/**
 * MyPi bundled UI extensions (header + editor). Keeps modules split; compose here.
 */
export default function mypiExtensions(pi: ExtensionAPI): void {
  registerFlowTitle(pi);
  registerRainbowEditor(pi);
}
