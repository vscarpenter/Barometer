/**
 * Only http(s) URLs are safe to put in an href. Incident URLs come from
 * third-party status feeds; a hostile/compromised feed could otherwise inject
 * `javascript:`/`data:` and run script in our origin. Allowlist, not denylist.
 */
export function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
