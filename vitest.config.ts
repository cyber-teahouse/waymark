import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // git 密集的集成测试在 Windows 并行负载下可能超过默认 5s
    testTimeout: 20000,
  },
});
