import { defineConfig } from "vitest/config";

// The engine and the presenter are DOM-free, so the node environment is enough.
// A Solid component test would need vite-plugin-solid + jsdom.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
