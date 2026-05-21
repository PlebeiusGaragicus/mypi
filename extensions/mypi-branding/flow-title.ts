import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ActivePresetState } from "../../shared/presets/state";
import { brandingFgRgb, brandingUseTruecolor } from "./branding-color-support";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const DEEP_BLUE: Rgb = [22, 83, 189];
const BLUE: Rgb = [48, 129, 247];
const SKY: Rgb = [93, 171, 255];
const ICE: Rgb = [151, 205, 255];
const PALETTE: Rgb[] = [DEEP_BLUE, BLUE, SKY, ICE, SKY, BLUE];

type Rgb = [number, number, number];

// Hand-drawn MYPI (ANSI-shadow style: █ ╔ ╗ ═ ║ ╚ ╝), six rows like the old FLOW banner.
const TITLE_LINES = [
  "███╗   ███╗ ██╗   ██╗ █████╗   ██╗",
  "████╗ ████║ ╚██╗ ██╔╝ ██╔══██╗ ██║",
  "██╔████╔██║  ╚████╔╝  ██████╔╝ ██║",
  "██║╚██╔╝██║   ╚██╔╝   ██╔═══╝  ██║",
  "██║ ╚═╝ ██║    ██║    ██║      ██║",
  "╚═╝     ╚═╝    ╚═╝    ╚═╝      ╚═╝",
];

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function sampleGradient(position: number) {
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * PALETTE.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % PALETTE.length;
  const t = scaled - index;
  const a = PALETTE[index]!;
  const b = PALETTE[nextIndex]!;
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)] as Rgb;
}

function fg(rgb: Rgb, text: string) {
	return `${brandingFgRgb(rgb)}${text}${RESET}`;
}

function gradientText(text: string, phase: number) {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      return fg(sampleGradient(index / span + phase), char);
    })
    .join("");
}

function center(text: string, width: number) {
  const length = [...text].length;
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function projectDirName() {
  return path.basename(process.cwd()) || "session";
}

function headerSubtitle(preset: ActivePresetState) {
  return `${preset.name} · ${projectDirName()}`;
}

function renderHeader(width: number, phase: number, subtitleText: string) {
  const lines = TITLE_LINES.map((line, row) =>
    gradientText(center(line, width), phase + row * 0.045),
  );
  const subtitle = center(subtitleText, width);

  const legacyBanner = !brandingUseTruecolor()
    ? center(fg([102, 102, 128], "Using Legacy color support"), width)
    : null;

  return [
    "",
    ...(legacyBanner ? [legacyBanner] : []),
    ...lines,
    `${BOLD}${gradientText(subtitle, phase + 0.18)}${RESET}`,
    "",
  ];
}

export function syncFlowHeader(ctx: ExtensionContext, preset: ActivePresetState | null): void {
  if (!ctx.hasUI) return;
  if (!preset) {
    ctx.ui.setHeader(undefined);
    return;
  }

  const subtitle = headerSubtitle(preset);
  ctx.ui.setHeader((tui) => {
    return {
      render(width: number) {
        return renderHeader(width, 0, subtitle);
      },
      invalidate() {
        tui.requestRender();
      },
    };
  });
}

export function registerFlowTitle(pi: ExtensionAPI): void {
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });
}
