/**
 * End-to-end CLI + daemon smoke test (Tier 1 acceptance).
 */

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BROWSE = path.join(import.meta.dir, '..', 'dist', 'browse');
const BASIC_HTML = path.join(import.meta.dir, 'fixtures', 'basic.html');
const STATE_FILE = path.join('/tmp', `mypi-browse-accept-${process.pid}`, 'browse.json');

function runBrowse(args: string[]): { stdout: string; stderr: string; status: number | null } {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  return spawnSync(BROWSE, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      BROWSE_STATE_FILE: STATE_FILE,
      BROWSE_PARENT_PID: '0',
    },
  });
}

describe('CLI acceptance', () => {
  test('goto file://, snapshot -i, screenshot, status', async () => {
    const fileUrl = `file://${BASIC_HTML}`;
    try {
      let r = runBrowse(['goto', fileUrl]);
      expect(r.status).toBe(0);
      if (r.status !== 0) console.error(r.stderr);
      expect(r.stdout).toContain('Navigated');

      r = runBrowse(['snapshot', '-i']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/@e\d+/);
      expect(r.stdout).toContain('UNTRUSTED EXTERNAL CONTENT');

      const shotPath = `/tmp/mypi-browse-shot-${process.pid}.png`;
      r = runBrowse(['screenshot', shotPath]);
      expect(r.status).toBe(0);
      expect(fs.existsSync(shotPath)).toBe(true);

      r = runBrowse(['status']);
      expect(r.status).toBe(0);
      expect(r.stdout.toLowerCase()).toContain('healthy');
    } finally {
      runBrowse(['stop']);
      try {
        fs.rmSync(path.dirname(STATE_FILE), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }, 60_000);
});
