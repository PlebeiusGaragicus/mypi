/** Tier 1: optional audit log (no-op hooks; file path reserved in config). */

export function initAuditLog(_auditLogPath: string): void {}

export function writeAuditEntry(_entry: Record<string, unknown>): void {}
