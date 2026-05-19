/**
 * Bot / Cloudflare challenge page detection for agent-orchestrated handoff.
 */

import type { Page, Response } from 'playwright';

export type ChallengeKind = 'cloudflare' | 'turnstile' | 'generic_bot';

export interface ChallengeResult {
  detected: boolean;
  kind?: ChallengeKind;
  reason: string;
}

const TITLE_PATTERNS = [
  /just a moment/i,
  /checking your browser/i,
  /attention required/i,
  /verify you are human/i,
  /please wait/i,
  /ddos protection/i,
];

const BODY_SNIPPETS = [
  'checking your browser',
  'verify you are human',
  'cf-turnstile',
  'challenges.cloudflare.com',
  'enable javascript and cookies',
];

export function formatChallengeBanner(kind: ChallengeKind, url: string): string {
  const safeUrl = url.replace(/[\n\r]/g, '').slice(0, 300);
  return [
    `--- CHALLENGE_DETECTED: ${kind} ---`,
    `URL: ${safeUrl}`,
    'ACTION: Run `$B handoff "<reason>"`, notify the user, wait for them to complete the challenge, then `$B resume` before continuing automation.',
    '--- END CHALLENGE_DETECTED ---',
  ].join('\n');
}

export function appendChallengeBanner(result: string, kind: ChallengeKind, url: string): string {
  const banner = formatChallengeBanner(kind, url);
  if (result.includes('CHALLENGE_DETECTED')) return result;
  return `${result}\n\n${banner}`;
}

export function challengeFromGotoResponse(response: Response | null): ChallengeResult | null {
  if (!response) return null;
  const status = response.status();
  const headers = response.headers();
  const server = (headers['server'] || headers['Server'] || '').toLowerCase();
  if (status === 403 && server.includes('cloudflare')) {
    return { detected: true, kind: 'cloudflare', reason: 'HTTP 403 with Cloudflare server header' };
  }
  if (status === 503 && server.includes('cloudflare')) {
    return { detected: true, kind: 'cloudflare', reason: 'HTTP 503 with Cloudflare server header' };
  }
  return null;
}

export async function detectChallenge(page: Page): Promise<ChallengeResult> {
  const url = page.url();
  if (url.includes('/cdn-cgi/') || url.includes('__cf_chl')) {
    return { detected: true, kind: 'cloudflare', reason: 'Challenge URL path' };
  }

  let title = '';
  try {
    title = await page.title();
  } catch {
    /* ignore */
  }
  for (const pat of TITLE_PATTERNS) {
    if (pat.test(title)) {
      return { detected: true, kind: 'cloudflare', reason: `Page title: ${title.slice(0, 80)}` };
    }
  }

  const domSignals = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').slice(0, 4000).toLowerCase();
    const hasChallengeForm = !!document.querySelector('#challenge-form, #cf-challenge-running, .cf-turnstile, [data-translate="checking_browser"]');
    const hasTurnstileIframe = !!document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
    const hasCfRay = !!document.querySelector('[class*="cf-"], #cf-wrapper');
    return { bodyText, hasChallengeForm, hasTurnstileIframe, hasCfRay };
  }).catch(() => null);

  if (domSignals) {
    if (domSignals.hasTurnstileIframe) {
      return { detected: true, kind: 'turnstile', reason: 'Turnstile iframe present' };
    }
    if (domSignals.hasChallengeForm) {
      return { detected: true, kind: 'cloudflare', reason: 'Challenge form DOM' };
    }
    for (const snippet of BODY_SNIPPETS) {
      if (domSignals.bodyText.includes(snippet)) {
        return { detected: true, kind: 'cloudflare', reason: `Body contains: ${snippet}` };
      }
    }
    if (domSignals.hasCfRay && TITLE_PATTERNS.some(p => p.test(title))) {
      return { detected: true, kind: 'cloudflare', reason: 'Cloudflare wrapper + challenge title' };
    }
  }

  return { detected: false, reason: '' };
}

export async function detectChallengeOnPage(page: Page, gotoResponse?: Response | null): Promise<ChallengeResult> {
  const fromResponse = challengeFromGotoResponse(gotoResponse ?? null);
  if (fromResponse?.detected) return fromResponse;
  return detectChallenge(page);
}
