import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "../../build/pdf-reader",
    emptyOutDir: true,
    lib: {
      entry: "main.ts",
      name: "PdfReader",
      formats: ["es"],
      fileName: "main",
    },
    rollupOptions: {
      external: [],
      output: {
        format: "es",
      },
    },
    sourcemap: true,
  },
  server: {
    port: 3001,
    cors: true,
  },
});
