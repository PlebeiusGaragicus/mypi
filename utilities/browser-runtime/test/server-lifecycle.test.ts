import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  startParentWatchdog,
  stopParentWatchdog,
  onBrowserEnterHeadedMode,
  persistHeadedModeInStateFile,
} from '../src/server-lifecycle';

describe('server-lifecycle', () => {
  afterEach(() => {
    stopParentWatchdog();
  });

  test('parent watchdog no-ops for pid 0', () => {
    let called = false;
    startParentWatchdog(0, () => { called = true; });
    expect(called).toBe(false);
  });

  test('parent watchdog fires immediately when parent pid is dead', () => {
    let called = false;
    startParentWatchdog(999999999, () => { called = true; });
    expect(called).toBe(true);
  });

  test('stopParentWatchdog prevents interval callback', async () => {
    let called = false;
    startParentWatchdog(process.pid, () => { called = true; });
    stopParentWatchdog();
    await Bun.sleep(100);
    expect(called).toBe(false);
  });

  test('onBrowserEnterHeadedMode stops watchdog', async () => {
    let called = false;
    startParentWatchdog(process.pid, () => { called = true; });
    onBrowserEnterHeadedMode();
    await Bun.sleep(100);
    expect(called).toBe(false);
  });
});

describe('persistHeadedModeInStateFile', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browse-headed-'));
  const stateFile = path.join(tmpDir, 'browse.json');

  beforeEach(() => {
    process.env.BROWSE_STATE_FILE = stateFile;
    fs.writeFileSync(stateFile, JSON.stringify({ pid: 1, port: 9, mode: 'launched' }, null, 2));
  });

  afterEach(() => {
    delete process.env.BROWSE_STATE_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('updates mode to headed', () => {
    persistHeadedModeInStateFile();
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(state.mode).toBe('headed');
  });
});
