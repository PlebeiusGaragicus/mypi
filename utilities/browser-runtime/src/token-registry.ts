/**
 * Tier 1: root token only. Scoped pairing deferred to a later milestone.
 */

export type ScopeCategory = 'read' | 'write' | 'admin' | 'meta' | 'control';

export interface TokenInfo {
  token: string;
  clientId: string;
  type: 'session';
  scopes: ScopeCategory[];
  tabPolicy: 'shared';
  rateLimit: number;
  expiresAt: string | null;
  createdAt: string;
  commandCount: number;
}

let rootToken: string | null = null;

export function initRegistry(authToken: string): void {
  rootToken = authToken;
}

export function validateScopedToken(token: string): TokenInfo | null {
  if (!rootToken || token !== rootToken) return null;
  return {
    token,
    clientId: 'root',
    type: 'session',
    scopes: ['read', 'write', 'admin', 'meta', 'control'],
    tabPolicy: 'shared',
    rateLimit: 0,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    commandCount: 0,
  };
}

export function isRootToken(token: string): boolean {
  return token === rootToken;
}

export function checkScope(_tokenInfo: TokenInfo, _command: string): boolean {
  return true;
}

export function checkDomain(_tokenInfo: TokenInfo, _url: string): boolean {
  return true;
}

export function checkRate(_tokenInfo: TokenInfo): { allowed: boolean; retryAfterMs?: number } {
  return { allowed: true };
}

export function recordCommand(_token: string): void {}
