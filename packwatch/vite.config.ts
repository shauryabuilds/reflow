import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  define: {
    // Dev-only features (plan simulator) exist only in `npm run dev` / `build:dev`.
    __PW_DEV__: JSON.stringify(mode !== "production"),
  },
  build: {
    target: "chrome116",
    outDir: mode === "production" ? "dist" : "dist-dev",
    emptyOutDir: true,
    rollupOptions: {
      input: { offscreen: "src/offscreen/offscreen.html" },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
}));
