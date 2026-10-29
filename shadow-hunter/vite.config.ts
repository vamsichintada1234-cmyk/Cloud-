import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the same build works inside the Android app.
  base: "./",
  server: { host: true, port: 5173 },
  // three.js alone is ~500 kB; it all ships inside the app anyway.
  build: { chunkSizeWarningLimit: 800 },
});
