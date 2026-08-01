import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const serviceWorkerBuildId = `${Date.now()}`;

export default defineConfig({
  base: "/ravan/",
  plugins: [
    react(),
    {
      name: "stamp-ravan-service-worker",
      closeBundle() {
        const serviceWorkerPath = resolve(__dirname, "dist/sw.js");
        const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
        writeFileSync(
          serviceWorkerPath,
          serviceWorker.replaceAll("__RAVAN_BUILD_ID__", serviceWorkerBuildId),
        );
      },
    },
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
});
