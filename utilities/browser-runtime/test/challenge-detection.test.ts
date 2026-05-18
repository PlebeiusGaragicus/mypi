import { describe, test, expect } from 'bun:test';
import { chromium } from 'playwright';
import { detectChallenge, formatChallengeBanner } from '../src/challenge-detection';
import * as path from 'path';

describe('challenge-detection', () => {
  test('formatChallengeBanner includes action', () => {
    const banner = formatChallengeBanner('cloudflare', 'https://example.com/cdn-cgi/challenge');
    expect(banner).toContain('CHALLENGE_DETECTED: cloudflare');
    expect(banner).toContain('$B handoff');
    expect(banner).toContain('$B resume');
  });

  test('detects cloudflare fixture HTML', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const fixture = path.join(import.meta.dir, 'fixtures/cloudflare-challenge.html');
    await page.goto(`file://${fixture}`);
    const result = await detectChallenge(page);
    await browser.close();
    expect(result.detected).toBe(true);
    expect(result.kind).toBe('cloudflare');
  });
});
