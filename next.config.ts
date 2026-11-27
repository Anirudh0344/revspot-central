import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/*
  Path prefix the app is served under, e.g. /p/cs-dashboard-1 on Marketplace; empty at
  the site root (local dev, a plain server).

  It is baked in at `next build`. Marketplace generates its own docker-compose, so
  build args may never arrive, and a Dockerfile default of "/" would mask the real
  value. So a bare "/" (or nothing) in the environment counts as unset, and the
  value is then read from the `.env` file that ships with the deployment.
*/
function readBasePath(): string {
  let raw = process.env.BASE_PATH ?? "";
  // Only a production build falls back to the file: `next dev` serves at the root
  // (.env.local sets BASE_PATH=/) even though .env carries the deployment prefix.
  if ((!raw || raw.trim() === "/") && process.env.NODE_ENV === "production") {
    try {
      const file = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
      raw = file.match(/^\s*BASE_PATH\s*=\s*["']?([^"'\s#]*)/m)?.[1] ?? "";
    } catch {
      raw = "";
    }
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^\/[A-Za-z0-9/_-]+$/.test(trimmed)) {
    throw new Error(`BASE_PATH must look like /p/my-app, got "${raw}"`);
  }
  return trimmed;
}

const basePath = readBasePath();

const nextConfig: NextConfig = {
  basePath,
  // Plain links and absolute redirects read it from here (src/lib/base-path.ts).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Every screen reads live deal state, so nothing here is cacheable.
  cacheComponents: false,
  // A second dev server (against the test database) builds into its own folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
