/**
 * browser-control server — persistent Chromium daemon (headless or headed).
 */

import { assertSupportedPlatform } from './platform';

import { BrowserManager } from './browser-manager';
import { handleReadCommand } from './read-commands';
import { handleWriteCommand } from './write-commands';
import { handleMetaCommand } from './meta-commands';
import {
  READ_COMMANDS,
  WRITE_COMMANDS,
  META_COMMANDS,
  PAGE_CONTENT_COMMANDS,
  DOM_CONTENT_COMMANDS,
  wrapUntrustedContent,
  canonicalizeCommand,
  buildUnknownCommandError,
  ALL_COMMANDS,
} from './commands';
import {
  markHiddenElements,
  getCleanTextWithStripping,
  cleanupHiddenMarkers,
  wrapUntrustedPageContent,
  runContentFilters,
  type ContentFilterResult,
} from './content-security';
import { initRegistry, validateScopedToken, type TokenInfo } from './token-registry';
import { resolveConfig, ensureStateDir, readVersionHash } from './config';
import { initAuditLog, writeAuditEntry } from './audit';
import { safeUnlink, safeUnlinkQuiet } from './error-handling';
import { detectChallenge, appendChallengeBanner } from './challenge-detection';
import { startParentWatchdog, stopParentWatchdog, onBrowserEnterHeadedMode } from './server-lifecycle';
import { consoleBuffer, networkBuffer, dialogBuffer } from './buffers';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';

const config = resolveConfig();
ensureStateDir(config);
initAuditLog(config.auditLog);

const AUTH_TOKEN = crypto.randomUUID();
initRegistry(AUTH_TOKEN);

const BROWSE_PORT = parseInt(process.env.BROWSE_PORT || '0', 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.BROWSE_IDLE_TIMEOUT || '1800000', 10);

const CONSOLE_LOG_PATH = config.consoleLog;
const NETWORK_LOG_PATH = config.networkLog;
const DIALOG_LOG_PATH = config.dialogLog;

const browserManager = new BrowserManager();
browserManager.onEnterHeadedMode = () => onBrowserEnterHeadedMode();

let lastActivity = Date.now();
let lastConsoleFlushed = 0;
let lastNetworkFlushed = 0;
let lastDialogFlushed = 0;
let isShuttingDown = false;
let flushInterval: ReturnType<typeof setInterval>;
let idleCheckInterval: ReturnType<typeof setInterval>;

function validateAuth(req: Request): boolean {
  const header = req.headers.get('authorization');
  return header === `Bearer ${AUTH_TOKEN}`;
}

function getTokenInfo(req: Request): TokenInfo | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return validateScopedToken(header.slice(7));
}

function isPortAvailable(port: number, hostname = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, hostname, () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findPort(): Promise<number> {
  if (BROWSE_PORT) {
    if (await isPortAvailable(BROWSE_PORT)) return BROWSE_PORT;
    throw new Error(`[browse] Port ${BROWSE_PORT} (BROWSE_PORT) is in use`);
  }
  const MIN_PORT = 10000;
  const MAX_PORT = 60000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
    if (await isPortAvailable(port)) return port;
  }
  throw new Error('[browse] No available port');
}

function wrapError(err: any): string {
  const msg = err.message || String(err);
  if (err.name === 'TimeoutError' || msg.includes('Timeout') || msg.includes('timeout')) {
    if (msg.includes('locator.')) {
      return 'Element not found or not interactable within timeout. Run snapshot for fresh refs.';
    }
    if (msg.includes('page.goto') || msg.includes('Navigation')) {
      return 'Page navigation timed out.';
    }
    return `Operation timed out: ${msg.split('\n')[0]}`;
  }
  if (msg.includes('resolved to') && msg.includes('elements')) {
    return 'Selector matched multiple elements. Use @refs from snapshot.';
  }
  return msg;
}

interface CommandResult {
  status: number;
  result: string;
  headers?: Record<string, string>;
  json?: boolean;
}

async function handleCommandInternal(
  body: { command: string; args?: string[]; tabId?: number },
  tokenInfo?: TokenInfo | null,
  opts?: { chainDepth?: number },
): Promise<CommandResult> {
  const { args = [], tabId } = body;
  const rawCommand = body.command;

  if (!rawCommand) {
    return { status: 400, result: JSON.stringify({ error: 'Missing "command" field' }), json: true };
  }

  const command = canonicalizeCommand(rawCommand);

  if (command === 'chain' && (opts?.chainDepth ?? 0) > 0) {
    return { status: 400, result: JSON.stringify({ error: 'Nested chain commands are not allowed' }), json: true };
  }

  let savedTabId: number | null = null;
  if (tabId !== undefined && tabId !== null) {
    savedTabId = browserManager.getActiveTabId();
    try {
      browserManager.switchTab(tabId, { bringToFront: false });
    } catch (err: any) {
      console.warn('[browse] Failed to pin tab', tabId, err.message);
    }
  }

  const startTime = Date.now();

  try {
    let result: string;
    const session = browserManager.getActiveSession();
    let hiddenContentWarnings: string[] = [];

    if (READ_COMMANDS.has(command)) {
      if (DOM_CONTENT_COMMANDS.has(command)) {
        const page = session.getPage();
        try {
          const strippedDescs = await markHiddenElements(page);
          if (strippedDescs.length > 0) {
            hiddenContentWarnings = strippedDescs.slice(0, 8).map(d => `hidden content: ${d.slice(0, 120)}`);
          }
          if (command === 'text') {
            const target = session.getActiveFrameOrPage();
            result = await getCleanTextWithStripping(target);
          } else {
            result = await handleReadCommand(command, args, session, browserManager);
          }
        } finally {
          await cleanupHiddenMarkers(page);
        }
      } else {
        result = await handleReadCommand(command, args, session, browserManager);
      }
    } else if (WRITE_COMMANDS.has(command)) {
      result = await handleWriteCommand(command, args, session, browserManager);
    } else if (META_COMMANDS.has(command)) {
      const chainDepth = opts?.chainDepth ?? 0;
      result = await handleMetaCommand(command, args, browserManager, shutdown, tokenInfo, {
        chainDepth,
        executeCommand: (b, ti) => handleCommandInternal(b, ti, { chainDepth: chainDepth + 1 }),
      });
    } else {
      return {
        status: 400,
        json: true,
        result: JSON.stringify({
          error: buildUnknownCommandError(rawCommand, ALL_COMMANDS),
          hint: `Available: ${[...ALL_COMMANDS].sort().join(', ')}`,
        }),
      };
    }

    if (PAGE_CONTENT_COMMANDS.has(command) && command !== 'chain') {
      const filterResult: ContentFilterResult = runContentFilters(
        result,
        browserManager.getCurrentUrl(),
        command,
      );
      if (filterResult.blocked) {
        return { status: 403, json: true, result: JSON.stringify({ error: filterResult.message }) };
      }
      const combinedWarnings = [...filterResult.warnings, ...hiddenContentWarnings];
      if (combinedWarnings.length > 0) {
        result = wrapUntrustedPageContent(result, command, combinedWarnings);
      } else {
        result = wrapUntrustedContent(result, browserManager.getCurrentUrl());
      }
    }

    if (command === 'text' || command === 'snapshot') {
      try {
        const challenge = await detectChallenge(browserManager.getPage());
        if (challenge.detected && challenge.kind) {
          result = appendChallengeBanner(result, challenge.kind, browserManager.getCurrentUrl());
        }
      } catch { /* page may be closed */ }
    }

    writeAuditEntry({
      ts: new Date().toISOString(),
      cmd: command,
      durationMs: Date.now() - startTime,
      status: 'ok',
    });

    browserManager.resetFailures();
    if (savedTabId !== null) {
      try {
        browserManager.switchTab(savedTabId, { bringToFront: false });
      } catch {
        /* ignore */
      }
    }
    return { status: 200, result };
  } catch (err: any) {
    if (savedTabId !== null) {
      try {
        browserManager.switchTab(savedTabId, { bringToFront: false });
      } catch {
        /* ignore */
      }
    }
    browserManager.incrementFailures();
    let errorMsg = wrapError(err);
    const hint = browserManager.getFailureHint();
    if (hint) errorMsg += '\n' + hint;
    writeAuditEntry({
      ts: new Date().toISOString(),
      cmd: command,
      durationMs: Date.now() - startTime,
      status: 'error',
      error: errorMsg,
    });
    return { status: 500, result: JSON.stringify({ error: errorMsg }), json: true };
  }
}

async function handleCommand(body: any, tokenInfo?: TokenInfo | null): Promise<Response> {
  const cr = await handleCommandInternal(body, tokenInfo);
  return new Response(cr.result, {
    status: cr.status,
    headers: { 'Content-Type': cr.json ? 'application/json' : 'text/plain', ...cr.headers },
  });
}

async function flushBuffers(): Promise<void> {
  try {
    const newConsole = consoleBuffer.totalAdded - lastConsoleFlushed;
    if (newConsole > 0) {
      const entries = consoleBuffer.last(Math.min(newConsole, consoleBuffer.length));
      const lines = entries.map(e =>
        `[${new Date(e.timestamp).toISOString()}] [${e.level}] ${e.text}`,
      ).join('\n') + '\n';
      fs.appendFileSync(CONSOLE_LOG_PATH, lines);
      lastConsoleFlushed = consoleBuffer.totalAdded;
    }
    const newNetwork = networkBuffer.totalAdded - lastNetworkFlushed;
    if (newNetwork > 0) {
      const entries = networkBuffer.last(Math.min(newNetwork, networkBuffer.length));
      const lines = entries.map(e =>
        `[${new Date(e.timestamp).toISOString()}] ${e.method} ${e.url} → ${e.status ?? 'pending'}`,
      ).join('\n') + '\n';
      fs.appendFileSync(NETWORK_LOG_PATH, lines);
      lastNetworkFlushed = networkBuffer.totalAdded;
    }
    const newDialog = dialogBuffer.totalAdded - lastDialogFlushed;
    if (newDialog > 0) {
      const entries = dialogBuffer.last(Math.min(newDialog, dialogBuffer.length));
      const lines = entries.map(e =>
        `[${new Date(e.timestamp).toISOString()}] [${e.type}] "${e.message}" → ${e.action}`,
      ).join('\n') + '\n';
      fs.appendFileSync(DIALOG_LOG_PATH, lines);
      lastDialogFlushed = dialogBuffer.totalAdded;
    }
  } catch (err: any) {
    console.error('[browse] Buffer flush failed:', err.message);
  }
}

function resetIdleTimer(): void {
  lastActivity = Date.now();
}

async function shutdown(exitCode = 0): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[browse] Shutting down...');
  stopParentWatchdog();
  clearInterval(flushInterval);
  clearInterval(idleCheckInterval);
  await flushBuffers();
  await browserManager.close();
  safeUnlinkQuiet(config.stateFile);
  process.exit(exitCode);
}

async function start(): Promise<void> {
  assertSupportedPlatform();

  safeUnlink(CONSOLE_LOG_PATH);
  safeUnlink(NETWORK_LOG_PATH);
  safeUnlink(DIALOG_LOG_PATH);

  const port = await findPort();
  const skipBrowser = process.env.BROWSE_HEADLESS_SKIP === '1';
  const headed = process.env.BROWSE_HEADED === '1';
  if (!skipBrowser) {
    if (headed) {
      await browserManager.launchHeaded(AUTH_TOKEN);
      console.log('[browse] Launched headed Chromium');
    } else {
      await browserManager.launch();
    }
  }

  const startTime = Date.now();
  browserManager.serverPort = port;

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      resetIdleTimer();
      const url = new URL(req.url);

      if (url.pathname === '/health' && req.method === 'GET') {
        const healthy = await browserManager.isHealthy();
        return Response.json({
          status: healthy ? 'healthy' : 'unhealthy',
          mode: browserManager.getConnectionMode(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          tabs: browserManager.getTabCount(),
        });
      }

      if (url.pathname === '/command' && req.method === 'POST') {
        if (!validateAuth(req)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const tokenInfo = getTokenInfo(req);
        if (!tokenInfo) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        try {
          const body = await req.json();
          return handleCommand(body, tokenInfo);
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    },
  });

  const state = {
    pid: process.pid,
    port: server.port,
    token: AUTH_TOKEN,
    startedAt: new Date().toISOString(),
    serverPath: import.meta.path,
    binaryVersion: process.env.BROWSE_BINARY_VERSION || readVersionHash() || 'dev',
    mode: (headed ? 'headed' : 'launched') as 'headed' | 'launched',
  };
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`[browse] Server listening on http://127.0.0.1:${server.port}`);

  flushInterval = setInterval(() => {
    flushBuffers().catch(err => console.warn('[browse] flush failed:', err.message));
  }, 5000);

  idleCheckInterval = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      console.log('[browse] Idle timeout — shutting down');
      shutdown(0);
    }
  }, 60_000);

  const parentPid = parseInt(process.env.BROWSE_PARENT_PID || '', 10);
  startParentWatchdog(parentPid, () => {
    console.log('[browse] Parent process exited — shutting down');
    shutdown(0);
  });

  // connect / BROWSE_HEADED=1: no CLI parent watchdog; still persist headed mode
  if (process.env.BROWSE_HEADED === '1') {
    onBrowserEnterHeadedMode();
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

browserManager.onDisconnect = () => shutdown(2);

if (import.meta.main) {
  start().catch((err) => {
    const logPath = path.join(config.stateDir, 'browse-startup-error.log');
    try {
      fs.writeFileSync(logPath, err.stack || err.message);
    } catch {
      /* ignore */
    }
    console.error('[browse] Failed to start:', err.message);
    process.exit(1);
  });
}

export { handleCommandInternal, AUTH_TOKEN };
