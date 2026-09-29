import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Build output directory. Overridable so a verification build can run beside a
  // running `next dev` (which owns `.next`) without the two trampling each other:
  //   $env:NEXT_DIST_DIR=".next-verify"; npx next build
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
};

export default nextConfig;
