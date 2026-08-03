import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const serviceWorkerBuildId = `${Date.now()}`;

export default defineConfig(({ mode }) => {
  const nativeBuild = mode === "native";

  return {
    root: nativeBuild ? resolve(__dirname, "native") : __dirname,
    publicDir: resolve(__dirname, "public"),
    base: nativeBuild ? "./" : "/ravan/",
    plugins: [
      react(),
      ...(!nativeBuild
        ? [
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
          ]
        : []),
    ],
    build: {
      target: "es2022",
      outDir: nativeBuild ? resolve(__dirname, "dist-native") : resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: nativeBuild
        ? undefined
        : {
            input: {
              landing: resolve(__dirname, "index.html"),
              app: resolve(__dirname, "app/index.html"),
              privacy: resolve(__dirname, "privacy/index.html"),
            },
          },
    },
  };
});
