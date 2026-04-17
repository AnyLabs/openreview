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
    proxy: {
      // 代理 OpenCode API 请求
      "/api/opencode": {
        target: "https://opencode.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/opencode/, ""),
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.log("proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req) => {
            console.log("Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            console.log("Received Response from the Target:", proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 3000,
  },
}));
