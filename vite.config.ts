import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

// Fix for __dirname in ES modules (used by Vite + TypeScript)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export an async config so we can dynamically import dev-only plugins
export default defineConfig(async ({ mode }) => {
  const plugins: Array<any> = [react()];

  // Only import lovable-tagger in development to avoid requiring it during production builds
  if (mode === "development") {
    try {
      const mod = await import("lovable-tagger");
      if (typeof mod.componentTagger === "function") {
        plugins.push(mod.componentTagger());
      }
    } catch (err) {
      // If the dev-only plugin fails to load, log to console but don't crash the config load.
      // This makes the config safer when running in environments where lovable-tagger isn't available.
      // eslint-disable-next-line no-console
      console.warn("lovable-tagger not loaded (dev only):", err?.message || err);
    }
  }

  return {
    server: {
      // Use 0.0.0.0 for broad compatibility on hosts like Render
      host: "0.0.0.0",
      port: 8080,
    },

    // 👇 Allow your Render domain to access the deployed site
    preview: {
      // allowedHosts should be hostnames (no protocol)
      allowedHosts: ["mchango-chama-hub-1.onrender.com"],
      port: 8080, // optional, matches server port
    },

    plugins: plugins.filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
