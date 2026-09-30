import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // `.kilo/**` holds editor worktrees that carry a whole second copy of `src/`, and
  // tsconfig.json already excludes it — without this, `npm run lint` reported every
  // warning twice (once for the real file, once for the stale copy).
  globalIgnores([".next/**", ".next-*/**", "out/**", "build/**", ".kilo/**", "next-env.d.ts"]),
]);
