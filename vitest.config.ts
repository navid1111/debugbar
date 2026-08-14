import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}"],
    setupFiles: ["./packages/react/src/test-setup.ts"],
    coverage: { exclude: ["**/dist/**", "examples/**"] },
  },
});
