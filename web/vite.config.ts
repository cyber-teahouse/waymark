import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL("../dist/web-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
