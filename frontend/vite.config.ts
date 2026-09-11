import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("src/features/storefront") || id.includes("src/pages/storefront")) {
            return "storefront-web-chunk";
          }
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas") || id.includes("node_modules/html2pdf")) {
            return "pdf-generation-chunk";
          }
        },
      },
    },
  },
});
