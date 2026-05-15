import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFlowTitle } from "./flow-title";
import { registerRainbowEditor } from "./rainbow-editor";
import registerRunFinishNotify from "./run-finish-notify";
import registerRunTimer from "./run-timer";
import registerSave from "./save";
import registerSay from "./say";
import { registerSystemView } from "./system-view";
import { registerWindowTitle } from "./title";

/**
 * MyPi bundled UI extensions (header, editor, window title, run timer, finish notify, /save, TTS, system prompt debug).
 * Keeps modules split; compose here.
 */
export default function mypiExtensions(pi: ExtensionAPI): void {
  registerFlowTitle(pi);
  registerRainbowEditor(pi);
  registerWindowTitle(pi);
  registerRunTimer(pi);
  registerRunFinishNotify(pi);
  registerSave(pi);
  registerSay(pi);
  registerSystemView(pi);
}
