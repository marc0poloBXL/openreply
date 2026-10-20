/**
 * Shared cron authorization check.
 *
 * Fails closed: requires a valid Bearer token matching CRON_SECRET
 * (or NEXTAUTH_SECRET as fallback). Uses timing-safe comparison so
 * the check itself doesn't leak token information.
 */

import { timingSafeEqual } from "crypto";

export function isCronAuthorized(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return false; // fail closed — never accept "Bearer undefined"

  const expected = `Bearer ${secret}`;
  if (!authHeader || authHeader.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export function cronAuthHeader(req: { headers: { get(name: string): string | null } }): boolean {
  return isCronAuthorized(req.headers.get("authorization"));
}