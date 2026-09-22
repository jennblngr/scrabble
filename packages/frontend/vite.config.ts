import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // The .env file lives at the repo root (shared with the backend), not here.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Scrabble",
        short_name: "Scrabble",
        description: "Scrabble à deux, à distance",
        start_url: "/",
        display: "standalone",
        background_color: "#faf6ee",
        theme_color: "#2f6f4e",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      // Precaching + navigation fallback (incl. the /api and /socket.io denylist) are
      // handled directly in src/sw.ts since push/notificationclick need a custom service worker.
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": {
        target: "ws://localhost:4000",
        ws: true,
      },
    },
  },
});
