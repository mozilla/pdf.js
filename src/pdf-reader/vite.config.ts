import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "../../build/pdf-reader",
    emptyOutDir: true,
    lib: {
      entry: "index.ts",
      name: "PdfReader",
      formats: ["es"],
      fileName: "index",
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
