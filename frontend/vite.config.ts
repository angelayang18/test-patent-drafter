import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envPrefix: ["VITE_", "REACT_APP_"],
  plugins: [react()],
  server: {
    port: 5173,
    // Allow LAN hostnames (e.g. eva1) and tunnel hosts when sharing a remote demo.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
