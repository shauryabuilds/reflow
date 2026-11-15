import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __PW_DEV__: "true" },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
