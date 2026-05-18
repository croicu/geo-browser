// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "happy-dom",
        setupFiles: ["tests/setup.ts"],
        pool: "forks",
    },
});