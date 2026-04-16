import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite 渲染进程配置
 */
export default defineConfig(() => ({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 3000,
  },
}));
