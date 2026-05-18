/**
 * Command registry — Tier 1 + Tier 2 browser-control commands.
 */

export const READ_COMMANDS = new Set([
  'text', 'html', 'links', 'forms', 'accessibility',
  'js', 'eval', 'css', 'attrs',
  'console', 'network', 'cookies', 'storage', 'perf',
  'dialog', 'is',
  'media', 'data',
]);

export const WRITE_COMMANDS = new Set([
  'goto', 'back', 'forward', 'reload',
  'load-html',
  'click', 'fill', 'select', 'hover', 'type', 'press', 'scroll', 'wait',
  'viewport', 'cookie', 'cookie-import', 'cookie-import-browser', 'header', 'useragent',
  'upload', 'dialog-accept', 'dialog-dismiss',
  'download', 'scrape', 'archive', 'cleanup', 'prettyscreenshot',
]);

export const META_COMMANDS = new Set([
  'tabs', 'tab', 'newtab', 'closetab',
  'status', 'stop', 'restart',
  'screenshot', 'responsive',
  'chain', 'url', 'snapshot',
  'pdf', 'diff',
  'handoff', 'resume', 'connect', 'disconnect', 'focus',
  'state', 'frame', 'ux-audit',
]);

export const ALL_COMMANDS = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);

export const PAGE_CONTENT_COMMANDS = new Set([
  'text', 'html', 'links', 'forms', 'accessibility', 'attrs',
  'console', 'dialog', 'snapshot',
]);

export const DOM_CONTENT_COMMANDS = new Set([
  'text', 'html', 'links', 'forms', 'accessibility', 'attrs',
]);

export function wrapUntrustedContent(result: string, url: string): string {
  const safeUrl = url.replace(/[\n\r]/g, '').slice(0, 200);
  const safeResult = result.replace(
    /--- (BEGIN|END) UNTRUSTED EXTERNAL CONTENT/g,
    '--- $1 UNTRUSTED EXTERNAL C\u200BONTENT',
  );
  return `--- BEGIN UNTRUSTED EXTERNAL CONTENT (source: ${safeUrl}) ---\n${safeResult}\n--- END UNTRUSTED EXTERNAL CONTENT ---`;
}

export const COMMAND_DESCRIPTIONS: Record<string, { category: string; description: string; usage?: string }> = {
  'goto': { category: 'Navigation', description: 'Navigate to URL', usage: 'goto <url>' },
  'load-html': { category: 'Navigation', description: 'Load HTML via setContent', usage: 'load-html <file>' },
  'back': { category: 'Navigation', description: 'History back' },
  'forward': { category: 'Navigation', description: 'History forward' },
  'reload': { category: 'Navigation', description: 'Reload page' },
  'url': { category: 'Navigation', description: 'Print current URL' },
  'text': { category: 'Reading', description: 'Cleaned page text' },
  'html': { category: 'Reading', description: 'innerHTML of selector or full page', usage: 'html [selector]' },
  'links': { category: 'Reading', description: 'All links' },
  'forms': { category: 'Reading', description: 'Form fields as JSON' },
  'accessibility': { category: 'Reading', description: 'Full ARIA tree' },
  'media': { category: 'Reading', description: 'Media elements on page', usage: 'media [--images|--videos|--audio] [selector]' },
  'data': { category: 'Reading', description: 'Structured page metadata', usage: 'data [--jsonld|--og|--meta|--twitter]' },
  'js': { category: 'Inspection', description: 'Run JavaScript expression', usage: 'js <expr>' },
  'eval': { category: 'Inspection', description: 'Run JavaScript from file', usage: 'eval <file>' },
  'css': { category: 'Inspection', description: 'Computed CSS value', usage: 'css <sel> <prop>' },
  'attrs': { category: 'Inspection', description: 'Element attributes as JSON', usage: 'attrs <sel|@ref>' },
  'is': { category: 'Inspection', description: 'State check', usage: 'is <prop> <sel>' },
  'console': { category: 'Inspection', description: 'Console messages', usage: 'console [--clear|--errors]' },
  'network': { category: 'Inspection', description: 'Network requests', usage: 'network [--clear]' },
  'dialog': { category: 'Inspection', description: 'Dialog messages', usage: 'dialog [--clear]' },
  'cookies': { category: 'Inspection', description: 'All cookies as JSON' },
  'storage': { category: 'Inspection', description: 'localStorage + sessionStorage', usage: 'storage [set k v]' },
  'perf': { category: 'Inspection', description: 'Page load timings' },
  'click': { category: 'Interaction', description: 'Click element', usage: 'click <sel>' },
  'fill': { category: 'Interaction', description: 'Fill input', usage: 'fill <sel> <val>' },
  'select': { category: 'Interaction', description: 'Select dropdown option', usage: 'select <sel> <val>' },
  'hover': { category: 'Interaction', description: 'Hover element', usage: 'hover <sel>' },
  'type': { category: 'Interaction', description: 'Type into focused element', usage: 'type <text>' },
  'press': { category: 'Interaction', description: 'Press key', usage: 'press <key>' },
  'scroll': { category: 'Interaction', description: 'Scroll element or page bottom', usage: 'scroll [sel]' },
  'wait': { category: 'Interaction', description: 'Wait for element or load', usage: 'wait <sel|--networkidle|--load>' },
  'upload': { category: 'Interaction', description: 'Upload file(s)', usage: 'upload <sel> <file>' },
  'viewport': { category: 'Interaction', description: 'Set viewport and optional scale', usage: 'viewport [<WxH>] [--scale <n>]' },
  'cookie': { category: 'Interaction', description: 'Set cookie', usage: 'cookie <name>=<value>' },
  'cookie-import': { category: 'Interaction', description: 'Import cookies from JSON file', usage: 'cookie-import <json>' },
  'cookie-import-browser': { category: 'Interaction', description: 'Import cookies from installed Chromium browser', usage: 'cookie-import-browser [browser] --domain <d> [--profile p]' },
  'header': { category: 'Interaction', description: 'Set request header', usage: 'header <name>:<value>' },
  'useragent': { category: 'Interaction', description: 'Set user agent', usage: 'useragent <string>' },
  'dialog-accept': { category: 'Interaction', description: 'Auto-accept next dialog', usage: 'dialog-accept [text]' },
  'dialog-dismiss': { category: 'Interaction', description: 'Auto-dismiss next dialog' },
  'download': { category: 'Extraction', description: 'Download URL or media ref', usage: 'download <url|@ref> [path] [--base64]' },
  'scrape': { category: 'Extraction', description: 'Bulk download page media', usage: 'scrape <images|videos|media> [--dir path] [--limit N]' },
  'archive': { category: 'Extraction', description: 'Save page as MHTML', usage: 'archive [path]' },
  'cleanup': { category: 'Interaction', description: 'Hide ads, cookie banners, clutter', usage: 'cleanup [--ads] [--cookies] [--all]' },
  'prettyscreenshot': { category: 'Visual', description: 'Clean screenshot with optional cleanup', usage: 'prettyscreenshot [--cleanup] [--scroll-to sel] [path]' },
  'screenshot': { category: 'Visual', description: 'Save screenshot', usage: 'screenshot [path]' },
  'responsive': { category: 'Visual', description: 'Multi-viewport screenshots', usage: 'responsive [prefix]' },
  'pdf': { category: 'Visual', description: 'Save page as PDF', usage: 'pdf [path] [--format A4]' },
  'diff': { category: 'Compare', description: 'Diff text of two URLs', usage: 'diff <url1> <url2>' },
  'tabs': { category: 'Tabs', description: 'List open tabs' },
  'tab': { category: 'Tabs', description: 'Switch to tab', usage: 'tab <id>' },
  'newtab': { category: 'Tabs', description: 'Open new tab', usage: 'newtab [url]' },
  'closetab': { category: 'Tabs', description: 'Close tab', usage: 'closetab [id]' },
  'status': { category: 'Server', description: 'Health check' },
  'stop': { category: 'Server', description: 'Shutdown server' },
  'restart': { category: 'Server', description: 'Restart server' },
  'handoff': { category: 'Server', description: 'Open visible browser for user takeover', usage: 'handoff [message]' },
  'resume': { category: 'Server', description: 'Resume automation after handoff' },
  'connect': { category: 'Server', description: 'Start headed browser (CLI only)' },
  'disconnect': { category: 'Server', description: 'Disconnect headed browser' },
  'focus': { category: 'Server', description: 'Bring browser window to foreground', usage: 'focus [@ref]' },
  'state': { category: 'Server', description: 'Save or load browser state', usage: 'state save|load <name>' },
  'frame': { category: 'Server', description: 'Switch iframe context', usage: 'frame <sel|main|--name n|--url pat>' },
  'ux-audit': { category: 'Reading', description: 'Structured UX audit JSON' },
  'snapshot': { category: 'Snapshot', description: 'Accessibility tree with @refs', usage: 'snapshot [flags]' },
  'chain': { category: 'Meta', description: 'Run commands from JSON stdin' },
};

const allCmds = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
const descKeys = new Set(Object.keys(COMMAND_DESCRIPTIONS));
for (const cmd of allCmds) {
  if (!descKeys.has(cmd)) throw new Error(`COMMAND_DESCRIPTIONS missing entry for: ${cmd}`);
}
for (const key of descKeys) {
  if (!allCmds.has(key)) throw new Error(`COMMAND_DESCRIPTIONS has unknown command: ${key}`);
}

export const COMMAND_ALIASES: Record<string, string> = {
  'setcontent': 'load-html',
  'set-content': 'load-html',
  'setContent': 'load-html',
};

export function canonicalizeCommand(cmd: string): string {
  return COMMAND_ALIASES[cmd] ?? cmd;
}

export const NEW_IN_VERSION: Record<string, string> = {
  'load-html': '0.1.0',
  'handoff': '0.2.0',
  'pdf': '0.2.0',
};

export function buildUnknownCommandError(
  command: string,
  commandSet: Set<string>,
  aliasMap: Record<string, string> = COMMAND_ALIASES,
  newInVersion: Record<string, string> = NEW_IN_VERSION,
): string {
  let msg = `Unknown command: '${command}'.`;
  if (command.length >= 4) {
    let best: string | undefined;
    let bestDist = 3;
    const candidates = [...commandSet, ...Object.keys(aliasMap)].sort();
    for (const cand of candidates) {
      const d = levenshtein(command, cand);
      if (d <= 2 && d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (best) msg += ` Did you mean '${best}'?`;
  }
  if (newInVersion[command]) {
    msg += ` This command was added in browser-runtime v${newInVersion[command]}.`;
  }
  return msg;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m.push([i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}
