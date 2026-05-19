/**
 * Server lifecycle helpers — parent CLI watchdog and headed-mode state.
 *
 * Autostart ties the daemon to the short-lived `$B` CLI process. After handoff
 * (or connect), the headed browser must outlive that CLI, so we stop the watchdog.
 */

import * as fs from 'fs';
import { resolveConfig } from './config';

let parentWatchdogTimer: ReturnType<typeof setInterval> | null = null;

function isParentAlive(parentPid: number): boolean {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until `parentPid` exits, then call `onParentExit` once. No-op if pid <= 0. */
export function startParentWatchdog(parentPid: number, onParentExit: () => void): void {
  stopParentWatchdog();
  if (parentPid <= 0) return;
  if (!isParentAlive(parentPid)) {
    onParentExit();
    return;
  }
  parentWatchdogTimer = setInterval(() => {
    if (isParentAlive(parentPid)) return;
    stopParentWatchdog();
    onParentExit();
  }, 15_000);
}

export function stopParentWatchdog(): void {
  if (parentWatchdogTimer) {
    clearInterval(parentWatchdogTimer);
    parentWatchdogTimer = null;
  }
}

/** Mark browse.json as headed so CLI health checks match reality after handoff. */
export function persistHeadedModeInStateFile(): void {
  const config = resolveConfig();
  try {
    const raw = fs.readFileSync(config.stateFile, 'utf-8');
    const state = JSON.parse(raw) as { mode?: string };
    if (state.mode === 'headed') return;
    state.mode = 'headed';
    fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    // No state file (unit tests) or corrupt — ignore
  }
}

/** Headed browser is user-facing; daemon must not die when the invoking CLI exits. */
export function onBrowserEnterHeadedMode(): void {
  stopParentWatchdog();
  persistHeadedModeInStateFile();
}
