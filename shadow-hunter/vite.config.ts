import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the same build works inside the Android app.
  base: "./",
  server: { host: true, port: 5173 },
});
