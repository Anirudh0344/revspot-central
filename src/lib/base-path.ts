/*
  The app can be served under a path prefix (Marketplace: /p/{slug}). next.config.ts
  reads BASE_PATH at build time and exposes the normalised value here.

  Next.js adds the prefix by itself to <Link>, router.push and redirect(). Anything
  else that names an app URL (a plain <a href>, a full URL in a redirect, an OAuth
  callback) has to add it: use withBase() / appUrl().
*/

/** '' at the site root, otherwise e.g. '/p/cs-dashboard-1' (no trailing slash). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** '/settings' -> '/p/cs-dashboard-1/settings' */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
