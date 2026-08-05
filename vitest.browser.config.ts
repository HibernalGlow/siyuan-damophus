import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const bundledChrome = "D:\\scoop\\apps\\chrome\\current\\chrome.exe";
const executablePath = process.env.SIYUAN_DAMOPHUS_CHROME_PATH
  ?? (existsSync(bundledChrome) ? bundledChrome : undefined);

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  plugins: [tailwindcss(), svelte()],
  test: {
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { executablePath } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
