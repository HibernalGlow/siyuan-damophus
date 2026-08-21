import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "siyuan": resolve(import.meta.dirname, "src/test/siyuan-browser-mock.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
    environment: "node",
  },
});
