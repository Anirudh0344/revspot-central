import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every screen reads live deal state, so nothing here is cacheable.
  cacheComponents: false,
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
