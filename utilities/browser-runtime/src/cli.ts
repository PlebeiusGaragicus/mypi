/**
 * browser-control CLI — thin wrapper for the persistent Playwright server.
 * Supported platforms: macOS and Linux only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { safeUnlink, safeUnlinkQuiet, safeKill, isProcessAlive } from './error-handling';
import { resolveConfig, ensureStateDir, readVersionHash } from './config';
import { assertSupportedPlatform } from './platform';

const config = resolveConfig();
const MAX_START_WAIT = process.env.CI ? 30000 : 8000;

export function resolveServerScript(
  env: Record<string, string | undefined> = process.env,
  metaDir: string = import.meta.dir,
  execPath: string = process.execPath,
): string {
  if (env.BROWSE_SERVER_SCRIPT) return env.BROWSE_SERVER_SCRIPT;
  if (!metaDir.includes('$bunfs')) {
    const direct = path.resolve(metaDir, 'server.ts');
    if (fs.existsSync(direct)) return direct;
  }
  if (execPath) {
    const adjacent = path.resolve(path.dirname(execPath), '..', 'src', 'server.ts');
    if (fs.existsSync(adjacent)) return adjacent;
  }
  throw new Error('Cannot find server.ts. Set BROWSE_SERVER_SCRIPT or run from source tree.');
}

const SERVER_SCRIPT = resolveServerScript();

export interface ServerState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  serverPath: string;
  binaryVersion?: string;
  mode?: 'launched' | 'headed';
}

export function readState(): ServerState | null {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, 'utf-8'));
  } catch {
    return null;
  }
}

export async function isServerHealthy(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return false;
    const health = await resp.json() as { status?: string };
    return health.status === 'healthy';
  } catch {
    return false;
  }
}

async function killServer(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) return;
  safeKill(pid, 'SIGTERM');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await Bun.sleep(100);
  }
  if (isProcessAlive(pid)) safeKill(pid, 'SIGKILL');
}

function cleanupLegacyState(): void {
  try {
    const files = fs.readdirSync('/tmp').filter(f => f.startsWith('browse-server') && f.endsWith('.json'));
    for (const file of files) {
      const fullPath = `/tmp/${file}`;
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (data.pid && isProcessAlive(data.pid)) {
          const check = Bun.spawnSync(['ps', '-p', String(data.pid), '-o', 'command='], {
            stdout: 'pipe', stderr: 'pipe', timeout: 2000,
          });
          const cmd = check.stdout.toString().trim();
          if (cmd.includes('bun') || cmd.includes('server.ts')) safeKill(data.pid, 'SIGTERM');
        }
        safeUnlink(fullPath);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function cleanupProfileLocks(profileDir: string): Promise<void> {
  try {
    const singletonLock = path.join(profileDir, 'SingletonLock');
    const lockTarget = fs.readlinkSync(singletonLock);
    const orphanPid = parseInt(lockTarget.split('-').pop() || '', 10);
    if (orphanPid && isProcessAlive(orphanPid)) {
      safeKill(orphanPid, 'SIGTERM');
      await Bun.sleep(1000);
      if (isProcessAlive(orphanPid)) safeKill(orphanPid, 'SIGKILL');
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT' && err?.code !== 'EINVAL') throw err;
  }
  for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    safeUnlinkQuiet(path.join(profileDir, lockFile));
  }
}

export async function startServer(extraEnv?: Record<string, string>): Promise<ServerState> {
  ensureStateDir(config);
  safeUnlink(config.stateFile);
  safeUnlink(path.join(config.stateDir, 'browse-startup-error.log'));

  const parentPid = parseInt(process.env.BROWSE_PARENT_PID || '', 10) === 0
    ? '0'
    : String(process.pid);
  const binaryVersion = readVersionHash(process.execPath) || 'dev';

  const proc = Bun.spawn(['bun', 'run', SERVER_SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BROWSE_STATE_FILE: config.stateFile,
      BROWSE_PARENT_PID: parentPid,
      BROWSE_BINARY_VERSION: binaryVersion,
      ...extraEnv,
    },
  });
  proc.unref();

  const start = Date.now();
  while (Date.now() - start < MAX_START_WAIT) {
    const state = readState();
    if (state && await isServerHealthy(state.port)) return state;
    await Bun.sleep(100);
  }

  if (proc.stderr) {
    const reader = proc.stderr.getReader();
    const { value } = await reader.read();
    if (value) {
      throw new Error(`Server failed to start:\n${new TextDecoder().decode(value)}`);
    }
  }
  const errorLogPath = path.join(config.stateDir, 'browse-startup-error.log');
  try {
    const errorLog = fs.readFileSync(errorLogPath, 'utf-8').trim();
    if (errorLog) throw new Error(`Server failed to start:\n${errorLog}`);
  } catch (e: any) {
    if (e.code !== 'ENOENT' && !e.message?.includes('Server failed')) throw e;
  }
  throw new Error(`Server failed to start within ${MAX_START_WAIT / 1000}s`);
}

function acquireServerLock(): (() => void) | null {
  const lockPath = `${config.stateFile}.lock`;
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
    return () => { safeUnlink(lockPath); };
  } catch {
    try {
      const holderPid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
      if (holderPid && isProcessAlive(holderPid)) return null;
      fs.unlinkSync(lockPath);
      return acquireServerLock();
    } catch {
      return null;
    }
  }
}

async function ensureServer(): Promise<ServerState> {
  const state = readState();
  if (state && await isServerHealthy(state.port)) {
    const currentVersion = readVersionHash();
    if (currentVersion && state.binaryVersion && currentVersion !== state.binaryVersion) {
      console.error('[browse] Binary updated, restarting server...');
      await killServer(state.pid);
      return startServer();
    }
    return state;
  }

  if (process.env.BROWSE_NO_AUTOSTART === '1') {
    console.error('[browse] Server not available and BROWSE_NO_AUTOSTART is set.');
    console.error('[browse] Run `$B connect` to start a headed browser.');
    process.exit(1);
  }

  if (state && state.mode === 'headed' && isProcessAlive(state.pid)) {
    console.error(`[browse] Headed server running (PID ${state.pid}) but not responding.`);
    console.error('[browse] Run `$B connect` to restart.');
    process.exit(1);
  }

  ensureStateDir(config);
  const releaseLock = acquireServerLock();
  if (!releaseLock) {
    console.error('[browse] Another instance is starting the server, waiting...');
    const start = Date.now();
    while (Date.now() - start < MAX_START_WAIT) {
      const freshState = readState();
      if (freshState && await isServerHealthy(freshState.port)) return freshState;
      await Bun.sleep(200);
    }
    throw new Error('Timed out waiting for another instance to start the server');
  }

  try {
    const freshState = readState();
    if (freshState && await isServerHealthy(freshState.port)) return freshState;
    if (state?.pid) await killServer(state.pid);
    console.error('[browse] Starting server...');
    return await startServer();
  } finally {
    releaseLock();
  }
}

export function extractTabId(args: string[]): { tabId: number | undefined; args: string[] } {
  const stripped: string[] = [];
  let tabId: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tab-id') {
      const next = args[++i];
      if (next !== undefined) {
        const parsed = parseInt(next, 10);
        if (!isNaN(parsed)) tabId = parsed;
      }
    } else {
      stripped.push(args[i]);
    }
  }
  return { tabId, args: stripped };
}

async function sendCommand(state: ServerState, command: string, args: string[], retries = 0): Promise<void> {
  const extracted = extractTabId(args);
  args = extracted.args;
  const envTab = process.env.BROWSE_TAB;
  const tabId = extracted.tabId ?? (envTab ? parseInt(envTab, 10) : undefined);
  const body = JSON.stringify({
    command,
    args,
    ...(tabId !== undefined && !isNaN(tabId) ? { tabId } : {}),
  });

  try {
    const resp = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (resp.status === 401) {
      const newState = readState();
      if (newState && newState.token !== state.token) {
        return sendCommand(newState, command, args);
      }
      throw new Error('Authentication failed');
    }

    const text = await resp.text();
    if (resp.ok) {
      process.stdout.write(text);
      if (!text.endsWith('\n')) process.stdout.write('\n');
    } else {
      try {
        const err = JSON.parse(text);
        console.error(err.error || text);
        if (err.hint) console.error(err.hint);
      } catch {
        console.error(text);
      }
      process.exit(1);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[browse] Command timed out after 30s');
      process.exit(1);
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message?.includes('fetch failed')) {
      if (retries >= 1) throw new Error('[browse] Server crashed twice in a row — aborting');
      console.error('[browse] Server connection lost. Restarting...');
      const oldState = readState();
      if (oldState?.pid) await killServer(oldState.pid);
      const newState = await startServer();
      return sendCommand(newState, command, args, retries + 1);
    }
    throw err;
  }
}

async function handleConnect(): Promise<void> {
  const profileDir = config.chromiumProfileDir;
  const existingState = readState();
  if (existingState?.mode === 'headed' && isProcessAlive(existingState.pid)) {
    try {
      const resp = await fetch(`http://127.0.0.1:${existingState.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        console.log('Already connected in headed mode.');
        process.exit(0);
      }
    } catch { /* restart */ }
  }

  if (existingState?.pid && isProcessAlive(existingState.pid)) {
    safeKill(existingState.pid, 'SIGTERM');
    await Bun.sleep(2000);
    if (isProcessAlive(existingState.pid)) safeKill(existingState.pid, 'SIGKILL');
  }

  await cleanupProfileLocks(profileDir);
  safeUnlinkQuiet(config.stateFile);

  console.log('Launching headed Chromium...');
  const newState = await startServer({
    BROWSE_HEADED: '1',
    BROWSE_PORT: process.env.BROWSE_HEADED_PORT || '34567',
    BROWSE_PARENT_PID: '0',
  });

  const resp = await fetch(`http://127.0.0.1:${newState.port}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newState.token}`,
    },
    body: JSON.stringify({ command: 'status', args: [] }),
    signal: AbortSignal.timeout(5000),
  });
  console.log(`Connected (headed)\n${await resp.text()}`);
  process.exit(0);
}

async function handleDisconnect(): Promise<void> {
  const existingState = readState();
  if (!existingState || existingState.mode !== 'headed') {
    console.log('Not in headed mode — nothing to disconnect.');
    process.exit(0);
  }
  try {
    const resp = await fetch(`http://127.0.0.1:${existingState.port}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${existingState.token}`,
      },
      body: JSON.stringify({ command: 'disconnect', args: [] }),
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      console.log('Disconnected from headed browser.');
      process.exit(0);
    }
  } catch { /* force cleanup */ }

  if (isProcessAlive(existingState.pid)) {
    safeKill(existingState.pid, 'SIGTERM');
    await Bun.sleep(2000);
    if (isProcessAlive(existingState.pid)) safeKill(existingState.pid, 'SIGKILL');
  }
  await cleanupProfileLocks(config.chromiumProfileDir);
  safeUnlinkQuiet(config.stateFile);
  console.log('Disconnected (server was unresponsive — force cleaned).');
  process.exit(0);
}

async function main() {
  assertSupportedPlatform();

  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`browser-control — Playwright browser for AI agents (macOS/Linux)

Usage: $B <command> [args...]

Headed: connect | disconnect | handoff [msg] | resume | focus [@ref]
Challenge: on CHALLENGE_DETECTED → handoff, notify user, resume

See shared/skills/browser-control/SKILL.md for full command list.`);
    process.exit(0);
  }

  cleanupLegacyState();
  const command = args[0];
  const commandArgs = args.slice(1);

  if (command === 'connect') {
    await handleConnect();
    return;
  }
  if (command === 'disconnect') {
    await handleDisconnect();
    return;
  }

  if (command === 'chain' && commandArgs.length === 0) {
    commandArgs.push((await Bun.stdin.text()).trim());
  }

  const state = await ensureServer();
  await sendCommand(state, command, commandArgs);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[browse] ${err.message}`);
    process.exit(1);
  });
}
