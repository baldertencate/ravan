import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/farsi/",
  plugins: [react()],
  build: { target: "es2022" },
});
