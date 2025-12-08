import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Only import Replit plugins if running in Replit environment
const isReplit = process.env.REPL_ID !== undefined;

export default defineConfig({
  plugins: [
    react(),
    // Conditionally load Replit-specific plugins only in Replit environment
    ...(isReplit
      ? [
          // These plugins are only loaded in Replit
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
