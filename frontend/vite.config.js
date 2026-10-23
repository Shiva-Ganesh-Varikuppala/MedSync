import { defineConfig } from "vite";

// In development the browser talks to Vite (port 5173) and Vite forwards /api to
// the backend. Same origin => no CORS setup needed and no API address in the code.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_PROXY_TARGET || "http://localhost:5001", changeOrigin: true } }
  }
});
