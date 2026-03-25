/** Stable session_id for subnet memory APIs, derived from the authenticated user. */
export function subnetSessionIdForUser(userId: string): string {
  return `om-${userId}`
}
