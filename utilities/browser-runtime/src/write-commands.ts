/**
 * Write commands — navigate and interact with pages (side effects)
 *
 * goto, back, forward, reload, click, fill, select, hover, type,
 * press, scroll, wait, viewport, cookie, header, useragent
 */

import type { TabSession } from './tab-session';
import type { BrowserManager } from './browser-manager';
import { validateNavigationUrl } from './url-validation';
import { validateOutputPath, validateReadPath } from './path-security';
import * as fs from 'fs';
import * as path from 'path';
import type { SetContentWaitUntil } from './tab-session';
import { TEMP_DIR, isPathWithin } from './platform';
import { SAFE_DIRECTORIES } from './path-security';

export async function handleWriteCommand(
  command: string,
  args: string[],
  session: TabSession,
  bm: BrowserManager
): Promise<string> {
  const page = session.getPage();
  // Frame-aware target for locator-based operations (click, fill, etc.)
  const target = session.getActiveFrameOrPage();
  const inFrame = session.getFrame() !== null;

  switch (command) {
    case 'goto': {
      if (inFrame) throw new Error('Cannot use goto inside a frame. Run \'frame main\' first.');
      const url = args[0];
      if (!url) throw new Error('Usage: browse goto <url>');
      // Clear loadedHtml BEFORE navigation — a timeout after the main-frame commit
      // must not leave stale content that could resurrect on a later context recreation.
      session.clearLoadedHtml();
      const normalizedUrl = await validateNavigationUrl(url);
      const response = await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = response?.status() || 'unknown';
      return `Navigated to ${normalizedUrl} (${status})`;
    }

    case 'back': {
      if (inFrame) throw new Error('Cannot use back inside a frame. Run \'frame main\' first.');
      session.clearLoadedHtml();
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return `Back → ${page.url()}`;
    }

    case 'forward': {
      if (inFrame) throw new Error('Cannot use forward inside a frame. Run \'frame main\' first.');
      session.clearLoadedHtml();
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return `Forward → ${page.url()}`;
    }

    case 'reload': {
      if (inFrame) throw new Error('Cannot use reload inside a frame. Run \'frame main\' first.');
      session.clearLoadedHtml();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return `Reloaded ${page.url()}`;
    }

    case 'load-html': {
      if (inFrame) throw new Error('Cannot use load-html inside a frame. Run \'frame main\' first.');

      // --from-file <path.json>: read inline HTML from a JSON payload. Used by
      // make-pdf to dodge Windows argv size limits on large rendered HTML.
      // The JSON shape is { html: string, waitUntil?: "load"|"domcontentloaded"|"networkidle" }.
      // The safe-dirs + magic-byte + size-cap checks below still apply to the
      // INLINE HTML content, not to the payload file path itself.
      let fromFilePayload: { html: string; waitUntil?: SetContentWaitUntil } | null = null;
      let filePath: string | undefined;
      let waitUntil: SetContentWaitUntil = 'domcontentloaded';
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--from-file') {
          const payloadPath = args[++i];
          if (!payloadPath) throw new Error('load-html: --from-file requires a path');
          // Parity with the sibling `load-html <file>` path below (line 249):
          // that branch runs every `file://` target through validateReadPath
          // so the safe-dirs policy can't be side-stepped. Same policy must
          // apply here — otherwise --from-file becomes a read-anywhere escape
          // hatch for any caller that can pick the payload path (e.g., an
          // MCP caller issuing load-html with an attacker-influenced path).
          try {
            validateReadPath(path.resolve(payloadPath));
          } catch {
            throw new Error(
              `load-html: --from-file ${payloadPath} must be under ${SAFE_DIRECTORIES.join(' or ')} (security policy). Copy the payload into the project tree or /tmp first.`
            );
          }
          const raw = fs.readFileSync(payloadPath, 'utf8');
          let json: any;
          try { json = JSON.parse(raw); }
          catch (e: any) { throw new Error(`load-html: --from-file JSON parse failed: ${e.message}`); }
          if (typeof json.html !== 'string') {
            throw new Error('load-html: --from-file JSON must have a "html" string field');
          }
          if (json.waitUntil && json.waitUntil !== 'load'
              && json.waitUntil !== 'domcontentloaded' && json.waitUntil !== 'networkidle') {
            throw new Error(`load-html: --from-file waitUntil '${json.waitUntil}' invalid`);
          }
          fromFilePayload = { html: json.html, waitUntil: json.waitUntil };
        } else if (args[i] === '--wait-until') {
          const val = args[++i];
          if (val !== 'load' && val !== 'domcontentloaded' && val !== 'networkidle') {
            throw new Error(`Invalid --wait-until '${val}'. Must be one of: load, domcontentloaded, networkidle.`);
          }
          waitUntil = val;
        } else if (args[i].startsWith('--')) {
          throw new Error(`Unknown flag: ${args[i]}`);
        } else if (!filePath) {
          filePath = args[i];
        }
      }

      // Inline HTML path: validate size + magic byte, then setContent directly.
      if (fromFilePayload) {
        const MAX_BYTES = parseInt(process.env.GSTACK_BROWSE_MAX_HTML_BYTES || '', 10) || (50 * 1024 * 1024);
        if (Buffer.byteLength(fromFilePayload.html, 'utf8') > MAX_BYTES) {
          throw new Error(
            `load-html: --from-file html too large (> ${MAX_BYTES} bytes). ` +
            'Raise with GSTACK_BROWSE_MAX_HTML_BYTES=<N>.'
          );
        }
        const peek = fromFilePayload.html.trimStart();
        if (!/^<[a-zA-Z!?]/.test(peek)) {
          throw new Error('load-html: --from-file html does not start with a valid markup opener');
        }
        const finalWaitUntil = fromFilePayload.waitUntil ?? waitUntil;
        await session.setTabContent(fromFilePayload.html, { waitUntil: finalWaitUntil });
        return `Loaded HTML: (inline from --from-file, ${fromFilePayload.html.length} chars)`;
      }

      if (!filePath) throw new Error('Usage: browse load-html <file> [--wait-until load|domcontentloaded|networkidle] [--tab-id <N>]  |  load-html --from-file <payload.json> [--tab-id <N>]');

      // Extension allowlist
      const ALLOWED_EXT = ['.html', '.htm', '.xhtml', '.svg'];
      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        throw new Error(
          `load-html: file does not appear to be HTML. Expected .html/.htm/.xhtml/.svg, got ${ext || '(no extension)'}. Rename the file if it's really HTML.`
        );
      }

      const absolutePath = path.resolve(filePath);

      // Safe-dirs check (reuses canonical read-side policy)
      try {
        validateReadPath(absolutePath);
      } catch (e: any) {
        throw new Error(
          `load-html: ${absolutePath} must be under ${SAFE_DIRECTORIES.join(' or ')} (security policy). Copy the file into the project tree or /tmp first.`
        );
      }

      // stat check — reject non-file targets with actionable error
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(absolutePath);
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          throw new Error(
            `load-html: file not found at ${absolutePath}. Check spelling or copy the file under ${process.cwd()} or ${TEMP_DIR}.`
          );
        }
        throw e;
      }
      if (stat.isDirectory()) {
        throw new Error(`load-html: ${absolutePath} is a directory, not a file. Pass a .html file.`);
      }
      if (!stat.isFile()) {
        throw new Error(`load-html: ${absolutePath} is not a regular file.`);
      }

      // Size cap
      const MAX_BYTES = parseInt(process.env.GSTACK_BROWSE_MAX_HTML_BYTES || '', 10) || (50 * 1024 * 1024);
      if (stat.size > MAX_BYTES) {
        throw new Error(
          `load-html: file too large (${stat.size} bytes > ${MAX_BYTES} cap). Raise with GSTACK_BROWSE_MAX_HTML_BYTES=<N> or split the HTML.`
        );
      }

      // Single read: Buffer → magic-byte peek → utf-8 string
      const buf = await fs.promises.readFile(absolutePath);

      // Magic-byte check: strip UTF-8 BOM + leading whitespace, then verify the first
      // non-whitespace byte starts a markup construct. Accepts any <tag, <!doctype,
      // <!-- comment, <?xml prolog — including bare HTML fragments like `<div>...</div>`
      // which setContent wraps in a full document. Rejects binary files mis-renamed .html
      // (first byte won't be `<`).
      let peek = buf.slice(0, 200);
      if (peek[0] === 0xEF && peek[1] === 0xBB && peek[2] === 0xBF) {
        peek = peek.slice(3);
      }
      const peekStr = peek.toString('utf8').trimStart();
      // Valid markup opener: '<' followed by alpha (tag), '!' (doctype/comment), or '?' (xml prolog)
      const looksLikeMarkup = /^<[a-zA-Z!?]/.test(peekStr);
      if (!looksLikeMarkup) {
        const hexDump = Array.from(buf.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        throw new Error(
          `load-html: ${absolutePath} has ${ext} extension but content does not look like HTML. First bytes: ${hexDump}`
        );
      }

      const html = buf.toString('utf8');
      await session.setTabContent(html, { waitUntil });
      return `Loaded HTML: ${absolutePath} (${stat.size} bytes)`;
    }

    case 'click': {
      const selector = args[0];
      if (!selector) throw new Error('Usage: browse click <selector>');

      // Auto-route: if ref points to a real <option> inside a <select>, use selectOption
      const role = session.getRefRole(selector);
      if (role === 'option') {
        const resolved = await session.resolveRef(selector);
        if ('locator' in resolved) {
          const optionInfo = await resolved.locator.evaluate(el => {
            if (el.tagName !== 'OPTION') return null; // custom [role=option], not real <option>
            const option = el as HTMLOptionElement;
            const select = option.closest('select');
            if (!select) return null;
            return { value: option.value, text: option.text };
          });
          if (optionInfo) {
            await resolved.locator.locator('xpath=ancestor::select').selectOption(optionInfo.value, { timeout: 5000 });
            return `Selected "${optionInfo.text}" (auto-routed from click on <option>) → now at ${page.url()}`;
          }
          // Real <option> with no parent <select> or custom [role=option] — fall through to normal click
        }
      }

      const resolved = await session.resolveRef(selector);
      try {
        if ('locator' in resolved) {
          await resolved.locator.click({ timeout: 5000 });
        } else {
          await target.locator(resolved.selector).click({ timeout: 5000 });
        }
      } catch (err: any) {
        // Enhanced error guidance: clicking <option> elements always fails (not visible / timeout)
        const isOption = 'locator' in resolved
          ? await resolved.locator.evaluate(el => el.tagName === 'OPTION').catch(() => false)
          : await target.locator(resolved.selector).evaluate(
              el => el.tagName === 'OPTION'
            ).catch(() => false);
        if (isOption) {
          throw new Error(
            `Cannot click <option> elements. Use 'browse select <parent-select> <value>' instead of 'click' for dropdown options.`
          );
        }
        throw err;
      }
      // Wait for network to settle (catches XHR/fetch triggered by clicks)
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      return `Clicked ${selector} → now at ${page.url()}`;
    }

    case 'fill': {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(' ');
      if (!selector || !value) throw new Error('Usage: browse fill <selector> <value>');
      const resolved = await session.resolveRef(selector);
      if ('locator' in resolved) {
        await resolved.locator.fill(value, { timeout: 5000 });
      } else {
        await target.locator(resolved.selector).fill(value, { timeout: 5000 });
      }
      // Wait for network to settle (form validation XHRs)
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      return `Filled ${selector}`;
    }

    case 'select': {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(' ');
      if (!selector || !value) throw new Error('Usage: browse select <selector> <value>');
      const resolved = await session.resolveRef(selector);
      if ('locator' in resolved) {
        await resolved.locator.selectOption(value, { timeout: 5000 });
      } else {
        await target.locator(resolved.selector).selectOption(value, { timeout: 5000 });
      }
      // Wait for network to settle (dropdown-triggered requests)
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      return `Selected "${value}" in ${selector}`;
    }

    case 'hover': {
      const selector = args[0];
      if (!selector) throw new Error('Usage: browse hover <selector>');
      const resolved = await session.resolveRef(selector);
      if ('locator' in resolved) {
        await resolved.locator.hover({ timeout: 5000 });
      } else {
        await target.locator(resolved.selector).hover({ timeout: 5000 });
      }
      return `Hovered ${selector}`;
    }

    case 'type': {
      const text = args.join(' ');
      if (!text) throw new Error('Usage: browse type <text>');
      await page.keyboard.type(text);
      return `Typed ${text.length} characters`;
    }

    case 'press': {
      const key = args[0];
      if (!key) throw new Error('Usage: browse press <key> (e.g., Enter, Tab, Escape)');
      await page.keyboard.press(key);
      return `Pressed ${key}`;
    }

    case 'scroll': {
      // Parse --times N and --wait ms flags
      const timesIdx = args.indexOf('--times');
      const times = timesIdx >= 0 ? parseInt(args[timesIdx + 1], 10) || 1 : 0;
      const waitIdx = args.indexOf('--wait');
      const waitMs = waitIdx >= 0 ? parseInt(args[waitIdx + 1], 10) || 1000 : 1000;
      const selector = args.find(a => !a.startsWith('--') && args.indexOf(a) !== timesIdx + 1 && args.indexOf(a) !== waitIdx + 1);

      if (times > 0) {
        // Repeated scroll mode
        for (let i = 0; i < times; i++) {
          if (selector) {
            const resolved = await bm.resolveRef(selector);
            if ('locator' in resolved) {
              await resolved.locator.scrollIntoViewIfNeeded({ timeout: 5000 });
            } else {
              await target.locator(resolved.selector).scrollIntoViewIfNeeded({ timeout: 5000 });
            }
          } else {
            await target.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          }
          if (i < times - 1) await new Promise(r => setTimeout(r, waitMs));
        }
        return `Scrolled ${times} times${selector ? ` (${selector})` : ''} with ${waitMs}ms delay`;
      }

      // Single scroll (original behavior)
      if (selector) {
        const resolved = await session.resolveRef(selector);
        if ('locator' in resolved) {
          await resolved.locator.scrollIntoViewIfNeeded({ timeout: 5000 });
        } else {
          await target.locator(resolved.selector).scrollIntoViewIfNeeded({ timeout: 5000 });
        }
        return `Scrolled ${selector} into view`;
      }
      await target.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return 'Scrolled to bottom';
    }

    case 'wait': {
      const selector = args[0];
      if (!selector) throw new Error('Usage: browse wait <selector|--networkidle|--load|--domcontentloaded>');
      if (selector === '--networkidle') {
        const MAX_WAIT_MS = 300_000;
        const MIN_WAIT_MS = 1_000;
        const timeout = Math.min(Math.max(args[1] ? parseInt(args[1], 10) || MIN_WAIT_MS : 15000, MIN_WAIT_MS), MAX_WAIT_MS);
        await page.waitForLoadState('networkidle', { timeout });
        return 'Network idle';
      }
      if (selector === '--load') {
        await page.waitForLoadState('load');
        return 'Page loaded';
      }
      if (selector === '--domcontentloaded') {
        await page.waitForLoadState('domcontentloaded');
        return 'DOM content loaded';
      }
      const MAX_WAIT_MS = 300_000;
      const MIN_WAIT_MS = 1_000;
      const timeout = Math.min(Math.max(args[1] ? parseInt(args[1], 10) || MIN_WAIT_MS : 15000, MIN_WAIT_MS), MAX_WAIT_MS);
      const resolved = await session.resolveRef(selector);
      if ('locator' in resolved) {
        await resolved.locator.waitFor({ state: 'visible', timeout });
      } else {
        await target.locator(resolved.selector).waitFor({ state: 'visible', timeout });
      }
      return `Element ${selector} appeared`;
    }

    case 'viewport': {
      // Parse args: [<WxH>] [--scale <n>]. Either may be omitted, but NOT both.
      let sizeArg: string | undefined;
      let scaleArg: number | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--scale') {
          const val = args[++i];
          if (val === undefined || val === '') {
            throw new Error('viewport --scale: missing value. Usage: viewport [WxH] --scale <n>');
          }
          const parsed = Number(val);
          if (!Number.isFinite(parsed)) {
            throw new Error(`viewport --scale: value '${val}' is not a finite number.`);
          }
          scaleArg = parsed;
        } else if (args[i].startsWith('--')) {
          throw new Error(`Unknown viewport flag: ${args[i]}`);
        } else if (sizeArg === undefined) {
          sizeArg = args[i];
        } else {
          throw new Error(`Unexpected positional arg: ${args[i]}. Usage: viewport [WxH] [--scale <n>]`);
        }
      }

      if (sizeArg === undefined && scaleArg === undefined) {
        throw new Error('Usage: browse viewport [<WxH>] [--scale <n>]  (e.g. 375x812, or --scale 2 to keep current size)');
      }

      // Resolve width/height: either from sizeArg or from current viewport if --scale-only.
      let w: number, h: number;
      if (sizeArg) {
        if (!sizeArg.includes('x')) throw new Error('Usage: browse viewport [<WxH>] [--scale <n>] (e.g., 375x812)');
        const [rawW, rawH] = sizeArg.split('x').map(Number);
        w = Math.min(Math.max(Math.round(rawW) || 1280, 1), 16384);
        h = Math.min(Math.max(Math.round(rawH) || 720, 1), 16384);
      } else {
        // --scale without WxH → use BrowserManager's tracked viewport (source of truth
        // since setViewport + launchContext keep it in sync). Falls back reliably on
        // headed → headless transitions or contexts with viewport:null.
        const current = bm.getCurrentViewport();
        w = current.width;
        h = current.height;
      }

      if (scaleArg !== undefined) {
        const err = await bm.setDeviceScaleFactor(scaleArg, w, h);
        if (err) return `Viewport partially set: ${err}`;
        return `Viewport set to ${w}x${h} @ ${scaleArg}x (context recreated; refs and load-html content replayed)`;
      }

      await bm.setViewport(w, h);
      return `Viewport set to ${w}x${h}`;
    }

    case 'cookie': {
      const cookieStr = args[0];
      if (!cookieStr || !cookieStr.includes('=')) throw new Error('Usage: browse cookie <name>=<value>');
      const eq = cookieStr.indexOf('=');
      const name = cookieStr.slice(0, eq);
      const value = cookieStr.slice(eq + 1);
      const url = new URL(page.url());
      await page.context().addCookies([{
        name,
        value,
        domain: url.hostname,
        path: '/',
      }]);
      return `Cookie set: ${name}=****`;
    }

    case 'header': {
      const headerStr = args[0];
      if (!headerStr || !headerStr.includes(':')) throw new Error('Usage: browse header <name>:<value>');
      const sep = headerStr.indexOf(':');
      const name = headerStr.slice(0, sep).trim();
      const value = headerStr.slice(sep + 1).trim();
      await bm.setExtraHeader(name, value);
      const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token'];
      const redactedValue = sensitiveHeaders.includes(name.toLowerCase()) ? '****' : value;
      return `Header set: ${name}: ${redactedValue}`;
    }

    case 'useragent': {
      const ua = args.join(' ');
      if (!ua) throw new Error('Usage: browse useragent <string>');
      bm.setUserAgent(ua);
      const error = await bm.recreateContext();
      if (error) {
        return `User agent set to "${ua}" but: ${error}`;
      }
      return `User agent set: ${ua}`;
    }

    case 'upload': {
      const [selector, ...filePaths] = args;
      if (!selector || filePaths.length === 0) throw new Error('Usage: browse upload <selector> <file1> [file2...]');

      // Validate paths are within safe directories (same check as cookie-import)
      for (const fp of filePaths) {
        if (!fs.existsSync(fp)) throw new Error(`File not found: ${fp}`);
        if (path.isAbsolute(fp)) {
          let resolvedFp: string;
          try { resolvedFp = fs.realpathSync(path.resolve(fp)); } catch (err: any) { if (err?.code !== 'ENOENT') throw err; resolvedFp = path.resolve(fp); }
          if (!SAFE_DIRECTORIES.some(dir => isPathWithin(resolvedFp, dir))) {
            throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(', ')}`);
          }
        }
        if (path.normalize(fp).includes('..')) {
          throw new Error('Path traversal sequences (..) are not allowed');
        }
      }

      const resolved = await session.resolveRef(selector);
      if ('locator' in resolved) {
        await resolved.locator.setInputFiles(filePaths);
      } else {
        await target.locator(resolved.selector).setInputFiles(filePaths);
      }

      const fileInfo = filePaths.map(fp => {
        const stat = fs.statSync(fp);
        return `${path.basename(fp)} (${stat.size}B)`;
      }).join(', ');
      return `Uploaded: ${fileInfo}`;
    }

    case 'dialog-accept': {
      const text = args.length > 0 ? args.join(' ') : null;
      bm.setDialogAutoAccept(true);
      bm.setDialogPromptText(text);
      return text
        ? `Dialogs will be accepted with text: "${text}"`
        : 'Dialogs will be accepted';
    }

    case 'dialog-dismiss': {
      bm.setDialogAutoAccept(false);
      bm.setDialogPromptText(null);
      return 'Dialogs will be dismissed';
    }

    case 'cookie-import': {
      const filePath = args[0];
      if (!filePath) throw new Error('Usage: browse cookie-import <json-file>');
      // Path validation — resolve to absolute and check against safe dirs.
      // Fixes #707: relative paths previously bypassed the safe directory check.
      // Mirrors validateOutputPath() — resolves symlinks (e.g., macOS /tmp → /private/tmp).
      const resolved = path.resolve(filePath);
      let resolvedReal = resolved;
      try { resolvedReal = fs.realpathSync(resolved); } catch {
        // File may not exist yet — resolve parent dir instead
        try { resolvedReal = path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)); } catch {}
      }
      if (!SAFE_DIRECTORIES.some(dir => isPathWithin(resolvedReal, dir))) {
        throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(', ')}`);
      }
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf-8');
      let cookies: any[];
      try { cookies = JSON.parse(raw); } catch (err: any) { throw new Error(`Invalid JSON in ${filePath}: ${err?.message || err}`); }
      if (!Array.isArray(cookies)) throw new Error('Cookie file must contain a JSON array');

      // Auto-fill domain from current page URL when missing (consistent with cookie command)
      const pageUrl = new URL(page.url());
      const defaultDomain = pageUrl.hostname;

      for (const c of cookies) {
        if (!c.name || c.value === undefined) throw new Error('Each cookie must have "name" and "value" fields');
        if (!c.domain) {
          c.domain = defaultDomain;
        } else {
          const cookieDomain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
          if (cookieDomain !== defaultDomain && !defaultDomain.endsWith('.' + cookieDomain)) {
            throw new Error(`Cookie domain "${c.domain}" does not match current page domain "${defaultDomain}". Use the target site first.`);
          }
        }
        if (!c.path) c.path = '/';
      }

      await page.context().addCookies(cookies);
      const importedDomains = [...new Set(cookies.map((c: any) => c.domain).filter(Boolean))];
      if (importedDomains.length > 0) bm.trackCookieImportDomains(importedDomains);
      return `Loaded ${cookies.length} cookies from ${filePath}`;
    }


    default:
      throw new Error(`Unknown write command: ${command}`);
  }
}

/** Map MIME type to file extension. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
    'application/pdf': '.pdf', 'application/json': '.json',
    'text/html': '.html', 'text/plain': '.txt',
  };
  return map[mime] || '.bin';
}
