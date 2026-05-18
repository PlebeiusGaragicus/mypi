/**
 * Shared config for browser-control CLI + server.
 *
 * Resolution:
 *   1. BROWSE_STATE_FILE env → derive stateDir from parent
 *   2. BROWSER_CONTROL_STATE_DIR env → state dir + browse.json
 *   3. git rev-parse --show-toplevel → projectDir/.browser-control/
 *   4. process.cwd() fallback
 */

import * as fs from 'fs';
import * as path from 'path';

const STATE_DIR_NAME = '.browser-control';

export interface BrowseConfig {
  projectDir: string;
  stateDir: string;
  stateFile: string;
  consoleLog: string;
  networkLog: string;
  dialogLog: string;
  auditLog: string;
}

export function getGitRoot(): string | null {
  try {
    const proc = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 2_000,
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString().trim() || null;
  } catch {
    return null;
  }
}

export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): BrowseConfig {
  let stateFile: string;
  let stateDir: string;
  let projectDir: string;

  if (env.BROWSE_STATE_FILE) {
    stateFile = env.BROWSE_STATE_FILE;
    stateDir = path.dirname(stateFile);
    projectDir = path.dirname(stateDir);
  } else if (env.BROWSER_CONTROL_STATE_DIR) {
    stateDir = path.resolve(env.BROWSER_CONTROL_STATE_DIR);
    stateFile = path.join(stateDir, 'browse.json');
    projectDir = getGitRoot() || path.dirname(stateDir);
  } else if (env.WORKSPACE_DIR) {
    projectDir = env.WORKSPACE_DIR;
    stateDir = path.join(projectDir, STATE_DIR_NAME);
    stateFile = path.join(stateDir, 'browse.json');
  } else {
    projectDir = getGitRoot() || process.cwd();
    stateDir = path.join(projectDir, STATE_DIR_NAME);
    stateFile = path.join(stateDir, 'browse.json');
  }

  return {
    projectDir,
    stateDir,
    stateFile,
    consoleLog: path.join(stateDir, 'browse-console.log'),
    networkLog: path.join(stateDir, 'browse-network.log'),
    dialogLog: path.join(stateDir, 'browse-dialog.log'),
    auditLog: path.join(stateDir, 'browse-audit.jsonl'),
  };
}

export function ensureStateDir(config: BrowseConfig): void {
  try {
    fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  } catch (err: any) {
    if (err.code === 'EACCES') {
      throw new Error(`Cannot create state directory ${config.stateDir}: permission denied`);
    }
    if (err.code === 'ENOTDIR') {
      throw new Error(`Cannot create state directory ${config.stateDir}: a file exists at that path`);
    }
    throw err;
  }

  const gitignorePath = path.join(config.projectDir, '.gitignore');
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const dirPattern = STATE_DIR_NAME.replace('.', '\\.');
    const alreadyListed = new RegExp(`^${dirPattern}/?$`, 'm').test(content);
    if (!alreadyListed) {
      const separator = content.endsWith('\n') ? '' : '\n';
      fs.appendFileSync(gitignorePath, `${separator}${STATE_DIR_NAME}/\n`);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      const logPath = path.join(config.stateDir, 'browse-server.log');
      try {
        fs.appendFileSync(
          logPath,
          `[${new Date().toISOString()}] Warning: could not update .gitignore: ${err.message}\n`,
        );
      } catch {
        /* ignore */
      }
    }
  }
}

export function getRemoteSlug(): string {
  try {
    const proc = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 2_000,
    });
    if (proc.exitCode !== 0) throw new Error('no remote');
    const url = proc.stdout.toString().trim();
    const match = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `${match[1]}-${match[2]}`;
    throw new Error('unparseable');
  } catch {
    const root = getGitRoot();
    return path.basename(root || process.cwd());
  }
}

export function readVersionHash(execPath: string = process.execPath): string | null {
  try {
    const versionFile = path.resolve(path.dirname(execPath), '.version');
    return fs.readFileSync(versionFile, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}
