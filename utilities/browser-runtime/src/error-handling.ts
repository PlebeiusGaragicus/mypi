/**
 * Shared error-handling utilities for browse server and CLI.
 */

import * as fs from 'fs';

export function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

export function safeUnlinkQuiet(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch {}
}

export function safeKill(pid: number, signal: NodeJS.Signals | number): void {
  try {
    process.kill(pid, signal);
  } catch (err: any) {
    if (err?.code !== 'ESRCH') throw err;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
