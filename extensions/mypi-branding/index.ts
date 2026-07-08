import { registerFlowTitle } from "./flow-title";
import { registerRainbowEditor } from "./rainbow-editor";
import registerRunFinishNotify from "./run-finish-notify";
import registerRunTimer from "./run-timer";
import registerSave from "./save";
import registerTps from "./tps";
import registerSay from "./say";
import { registerSystemView } from "./system-view";
import { registerThemeCycler } from "./theme-cycler";
import { registerWindowTitle } from "./title";

type ExtensionAPI = Parameters<typeof registerFlowTitle>[0];

/**
 * MyPi bundled UI extensions (header, editor, window title, run timer, TPS, finish notify, /save, TTS, theme hotkey).
 * Keeps modules split; compose here.
 */
export default function mypiExtensions(pi: ExtensionAPI): void {
  registerFlowTitle(pi);
  registerRainbowEditor(pi);
  registerWindowTitle(pi);
  registerRunTimer(pi);
  registerTps(pi);
  registerRunFinishNotify(pi);
  registerSave(pi);
  registerSay(pi);
  registerSystemView(pi);
  registerThemeCycler(pi);
}
