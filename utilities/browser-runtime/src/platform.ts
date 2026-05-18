/**
 * Platform constants — macOS and Linux only.
 */

import * as path from 'path';

export const TEMP_DIR = '/tmp';

const SUPPORTED = new Set(['darwin', 'linux']);

export function assertSupportedPlatform(): void {
  if (!SUPPORTED.has(process.platform)) {
    throw new Error(
      `browser-control supports macOS and Linux only (got ${process.platform}).`,
    );
  }
}

/** Check if resolvedPath is within dir. */
export function isPathWithin(resolvedPath: string, dir: string): boolean {
  return resolvedPath === dir || resolvedPath.startsWith(dir + path.sep);
}
