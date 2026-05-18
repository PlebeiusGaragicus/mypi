/**
 * Meta commands — tabs, server control, screenshots, chain, diff, snapshot
 */

import type { BrowserManager } from './browser-manager';
import { handleSnapshot } from './snapshot';
import { READ_COMMANDS, WRITE_COMMANDS, META_COMMANDS, PAGE_CONTENT_COMMANDS, wrapUntrustedContent, canonicalizeCommand } from './commands';
import { checkScope, type TokenInfo } from './token-registry';
import { validateOutputPath, validateReadPath } from './path-security';
export { validateOutputPath } from './path-security';
import * as fs from 'fs';
import * as path from 'path';
import { TEMP_DIR } from './platform';

/** Tokenize a pipe segment respecting double-quoted strings. */
function tokenizePipeSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ' ' && !inQuote) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export interface MetaCommandOpts {
  chainDepth?: number;
  /** Callback to route subcommands through the full security pipeline (handleCommandInternal) */
  executeCommand?: (body: { command: string; args?: string[]; tabId?: number }, tokenInfo?: TokenInfo | null) => Promise<{ status: number; result: string; json?: boolean }>;
}

export async function handleMetaCommand(
  command: string,
  args: string[],
  bm: BrowserManager,
  shutdown: () => Promise<void> | void,
  tokenInfo?: TokenInfo | null,
  opts?: MetaCommandOpts,
): Promise<string> {
  // Per-tab operations use the active session; global operations use bm directly
  const session = bm.getActiveSession();

  switch (command) {
    // ─── Tabs ──────────────────────────────────────────
    case 'tabs': {
      const tabs = await bm.getTabListWithTitles();
      return tabs.map(t =>
        `${t.active ? '→ ' : '  '}[${t.id}] ${t.title || '(untitled)'} — ${t.url}`
      ).join('\n');
    }

    case 'tab': {
      const id = parseInt(args[0], 10);
      if (isNaN(id)) throw new Error('Usage: browse tab <id>');
      bm.switchTab(id);
      return `Switched to tab ${id}`;
    }

    case 'newtab': {
      // --json returns structured output (machine-parseable). Other flag-like
      // tokens are treated as the url. make-pdf always passes --json.
      let url: string | undefined;
      let jsonMode = false;
      for (const a of args) {
        if (a === '--json') { jsonMode = true; }
        else if (!url) { url = a; }
      }
      const id = await bm.newTab(url);
      if (jsonMode) {
        return JSON.stringify({ tabId: id, url: url ?? null });
      }
      return `Opened tab ${id}${url ? ` → ${url}` : ''}`;
    }

    case 'closetab': {
      const id = args[0] ? parseInt(args[0], 10) : undefined;
      await bm.closeTab(id);
      return `Closed tab${id ? ` ${id}` : ''}`;
    }

    // ─── Server Control ────────────────────────────────
    case 'status': {
      const page = bm.getPage();
      const tabs = bm.getTabCount();
      const mode = bm.getConnectionMode();
      return [
        `Status: healthy`,
        `Mode: ${mode}`,
        `URL: ${page.url()}`,
        `Tabs: ${tabs}`,
        `PID: ${process.pid}`,
      ].join('\n');
    }

    case 'url': {
      return bm.getCurrentUrl();
    }

    case 'stop': {
      await shutdown();
      return 'Server stopped';
    }

    case 'restart': {
      // Signal that we want a restart — the CLI will detect exit and restart
      console.log('[browse] Restart requested. Exiting for CLI to restart.');
      await shutdown();
      return 'Restarting...';
    }

    // ─── Visual ────────────────────────────────────────
    case 'screenshot': {
      // Parse priority: flags (--viewport, --clip, --base64) → selector (@ref, CSS) → output path
      const page = bm.getPage();
      let outputPath = `${TEMP_DIR}/browse-screenshot.png`;
      let clipRect: { x: number; y: number; width: number; height: number } | undefined;
      let targetSelector: string | undefined;
      let viewportOnly = false;
      let base64Mode = false;

      const remaining: string[] = [];
      let flagSelector: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--viewport') {
          viewportOnly = true;
        } else if (args[i] === '--base64') {
          base64Mode = true;
        } else if (args[i] === '--selector') {
          flagSelector = args[++i];
          if (!flagSelector) throw new Error('Usage: screenshot --selector <css> [path]');
        } else if (args[i] === '--clip') {
          const coords = args[++i];
          if (!coords) throw new Error('Usage: screenshot --clip x,y,w,h [path]');
          const parts = coords.split(',').map(Number);
          if (parts.length !== 4 || parts.some(isNaN))
            throw new Error('Usage: screenshot --clip x,y,width,height — all must be numbers');
          clipRect = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
        } else if (args[i].startsWith('--')) {
          throw new Error(`Unknown screenshot flag: ${args[i]}`);
        } else {
          remaining.push(args[i]);
        }
      }

      // Separate target (selector/@ref) from output path
      for (const arg of remaining) {
        // File paths containing / and ending with an image/pdf extension are never CSS selectors
        const isFilePath = arg.includes('/') && /\.(png|jpe?g|webp|pdf)$/i.test(arg);
        if (isFilePath) {
          outputPath = arg;
        } else if (arg.startsWith('@e') || arg.startsWith('@c') || arg.startsWith('.') || arg.startsWith('#') || arg.includes('[')) {
          targetSelector = arg;
        } else {
          outputPath = arg;
        }
      }

      // --selector flag takes precedence; conflict with positional selector.
      if (flagSelector !== undefined) {
        if (targetSelector !== undefined) {
          throw new Error('--selector conflicts with positional selector — choose one');
        }
        targetSelector = flagSelector;
      }

      validateOutputPath(outputPath);

      if (clipRect && targetSelector) {
        throw new Error('Cannot use --clip with a selector/ref — choose one');
      }
      if (viewportOnly && clipRect) {
        throw new Error('Cannot use --viewport with --clip — choose one');
      }

      // --base64 mode: capture to buffer instead of disk
      if (base64Mode) {
        let buffer: Buffer;
        if (targetSelector) {
          const resolved = await bm.resolveRef(targetSelector);
          const locator = 'locator' in resolved ? resolved.locator : page.locator(resolved.selector);
          buffer = await locator.screenshot({ timeout: 5000 });
        } else if (clipRect) {
          buffer = await page.screenshot({ clip: clipRect });
        } else {
          buffer = await page.screenshot({ fullPage: !viewportOnly });
        }
        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error('Screenshot too large for --base64 (>10MB). Use disk path instead.');
        }
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }

      if (targetSelector) {
        const resolved = await bm.resolveRef(targetSelector);
        const locator = 'locator' in resolved ? resolved.locator : page.locator(resolved.selector);
        await locator.screenshot({ path: outputPath, timeout: 5000 });
        return `Screenshot saved (element): ${outputPath}`;
      }

      if (clipRect) {
        await page.screenshot({ path: outputPath, clip: clipRect });
        return `Screenshot saved (clip ${clipRect.x},${clipRect.y},${clipRect.width},${clipRect.height}): ${outputPath}`;
      }

      await page.screenshot({ path: outputPath, fullPage: !viewportOnly });
      return `Screenshot saved${viewportOnly ? ' (viewport)' : ''}: ${outputPath}`;
    }


    case 'responsive': {
      const page = bm.getPage();
      const prefix = args[0] || `${TEMP_DIR}/browse-responsive`;
      validateOutputPath(prefix);
      const viewports = [
        { name: 'mobile', width: 375, height: 812 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1280, height: 720 },
      ];
      const originalViewport = page.viewportSize();
      const results: string[] = [];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const screenshotPath = `${prefix}-${vp.name}.png`;
        validateOutputPath(screenshotPath);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        results.push(`${vp.name} (${vp.width}x${vp.height}): ${screenshotPath}`);
      }

      // Restore original viewport
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      }

      return results.join('\n');
    }

    // ─── Chain ─────────────────────────────────────────
    case 'chain': {
      // Read JSON array from args[0] (if provided) or expect it was passed as body
      const jsonStr = args[0];
      if (!jsonStr) throw new Error(
        'Usage: echo \'[["goto","url"],["text"]]\' | browse chain\n' +
        '   or: browse chain \'goto url | click @e5 | snapshot -ic\''
      );

      let rawCommands: string[][];
      try {
        rawCommands = JSON.parse(jsonStr);
        if (!Array.isArray(rawCommands)) throw new Error('not array');
      } catch (err: any) {
        // Fallback: pipe-delimited format "goto url | click @e5 | snapshot -ic"
        if (!(err instanceof SyntaxError) && err?.message !== 'not array') throw err;
        rawCommands = jsonStr.split(' | ')
          .filter(seg => seg.trim().length > 0)
          .map(seg => tokenizePipeSegment(seg.trim()));
      }

      // Canonicalize aliases across the whole chain. Pair canonical name with the raw
      // input so result labels + error messages reflect what the user typed, but every
      // dispatch path (scope check, WRITE_COMMANDS.has, watch blocking, handler lookup)
      // uses the canonical name. Otherwise `chain '[["setcontent","/tmp/x.html"]]'`
      // bypasses prevalidation or runs under the wrong command set.
      const commands = rawCommands.map(cmd => {
        const [rawName, ...cmdArgs] = cmd;
        const name = canonicalizeCommand(rawName);
        return { rawName, name, args: cmdArgs };
      });

      // Pre-validate ALL subcommands against the token's scope before executing any.
      // Uses canonical name so aliases don't bypass scope checks.
      if (tokenInfo && tokenInfo.clientId !== 'root') {
        for (const c of commands) {
          if (!checkScope(tokenInfo, c.name)) {
            throw new Error(
              `Chain rejected: subcommand "${c.rawName}" not allowed by your token scope (${tokenInfo.scopes.join(', ')}). ` +
              `All subcommands must be within scope.`
            );
          }
        }
      }

      // Route each subcommand through handleCommandInternal for full security:
      // scope, domain, tab ownership, content wrapping — all enforced per subcommand.
      // Chain-specific options: skip rate check (chain = 1 request), skip activity
      // events (chain emits 1 event), increment chain depth (recursion guard).
      const executeCmd = opts?.executeCommand;
      const results: string[] = [];
      let lastWasWrite = false;

      if (executeCmd) {
        // Full security pipeline via handleCommandInternal.
        // Pass rawName so the server's own canonicalization is a no-op (already canonical).
        for (const c of commands) {
          const cr = await executeCmd(
            { command: c.name, args: c.args },
            tokenInfo,
          );
          const label = c.rawName === c.name ? c.name : `${c.rawName}→${c.name}`;
          if (cr.status === 200) {
            results.push(`[${label}] ${cr.result}`);
          } else {
            // Parse error from JSON result
            let errMsg = cr.result;
            try { errMsg = JSON.parse(cr.result).error || cr.result; } catch (err: any) { if (!(err instanceof SyntaxError)) throw err; }
            results.push(`[${label}] ERROR: ${errMsg}`);
          }
          lastWasWrite = WRITE_COMMANDS.has(c.name);
        }
      } else {
        // Fallback: direct dispatch (CLI mode, no server context)
        const { handleReadCommand } = await import('./read-commands');
        const { handleWriteCommand } = await import('./write-commands');

        for (const c of commands) {
          const name = c.name;
          const cmdArgs = c.args;
          const label = c.rawName === name ? name : `${c.rawName}→${name}`;
          try {
            let result: string;
            if (WRITE_COMMANDS.has(name)) {
              if (bm.isWatching()) {
                result = 'BLOCKED: write commands disabled in watch mode';
              } else {
                result = await handleWriteCommand(name, cmdArgs, session, bm);
              }
              lastWasWrite = true;
            } else if (READ_COMMANDS.has(name)) {
              result = await handleReadCommand(name, cmdArgs, session);
              if (PAGE_CONTENT_COMMANDS.has(name)) {
                result = wrapUntrustedContent(result, bm.getCurrentUrl());
              }
              lastWasWrite = false;
            } else if (META_COMMANDS.has(name)) {
              result = await handleMetaCommand(name, cmdArgs, bm, shutdown, tokenInfo, opts);
              lastWasWrite = false;
            } else {
              throw new Error(`Unknown command: ${c.rawName}`);
            }
            results.push(`[${label}] ${result}`);
          } catch (err: any) {
            results.push(`[${label}] ERROR: ${err.message}`);
          }
        }
      }

      // Wait for network to settle after write commands before returning
      if (lastWasWrite) {
        await bm.getPage().waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      }

      return results.join('\n\n');
    }

    // ─── Diff ──────────────────────────────────────────

    case 'snapshot': {
      const isScoped = tokenInfo && tokenInfo.clientId !== 'root';
      const snapshotResult = await handleSnapshot(args, session, {
        splitForScoped: !!isScoped,
      });
      // Scoped tokens get split format (refs outside envelope); root gets basic wrapping
      if (isScoped) {
        return snapshotResult; // already has envelope from split format
      }
      return wrapUntrustedContent(snapshotResult, bm.getCurrentUrl());
    }

    default:
      throw new Error(`Unknown meta command: ${command}`);
  }
}
