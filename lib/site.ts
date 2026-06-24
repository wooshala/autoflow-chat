/** Multi-site key; single property MVP uses `default`. */
export function getSiteId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_ID?.trim();
  return fromEnv || 'default';
}
