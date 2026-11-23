import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
