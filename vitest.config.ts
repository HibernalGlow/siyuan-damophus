import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        compatibility: {
          componentApi: 4,
        },
      },
    }),
  ],
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
