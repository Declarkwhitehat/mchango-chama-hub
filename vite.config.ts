import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";

// Fix for __dirname in ES modules (used by Vite + TypeScript)
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::", // You can also use "0.0.0.0" if "::" causes issues
    port: 8080,
  },

  // 👇 Allow your Render domain to access the deployed site
  preview: {
    allowedHosts: ["https://mchango-chama-hub-1.onrender.com"],
    port: 8080, // optional, matches server port
  },

  plugins: [
    react(),
    // Load componentTagger only in development if needed
    mode === "development" ? componentTagger() : undefined,
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
