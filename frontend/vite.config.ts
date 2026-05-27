import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envPrefix: ["VITE_", "REACT_APP_"],
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
