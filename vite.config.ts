import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  preview: {
    allowedHosts: ["mchango-chama-hub.onrender.com"],
    host: "0.0.0.0",
    port: 8080,
  },
}));
