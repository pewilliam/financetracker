import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          framework: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"]
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.KASHY_API_PROXY_TARGET || "http://api:8010",
        xfwd: true
      }
    }
  }
});
