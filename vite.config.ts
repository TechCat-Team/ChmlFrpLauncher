import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Android 模拟器通过宿主机的网络地址访问开发服务器。
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // 不监听 Rust 侧目录：Cargo 编译时会锁定 target 中的文件，监听会导致 EBUSY 崩溃
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    cssMinify: "esbuild",
    minify: "esbuild",
  },
});
