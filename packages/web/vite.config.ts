import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    port: 5173,
    // The browser talks to /api on its own origin, so the API needs no CORS setup.
    proxy: {
      "/api": {
        target: process.env.SUMI_API_URL ?? "http://localhost:3000",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: { environment: "happy-dom" },
});
