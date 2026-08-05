import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "playground"),
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  plugins: [
    tailwindcss(),
    svelte({ configFile: resolve(import.meta.dirname, "svelte.config.js") }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
