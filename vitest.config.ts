import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 코어 엔진은 순수 함수 위주라 노드 환경으로 충분하다.
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // 타입 전용 파일과 진입점은 커버리지 계산에서 제외한다.
      exclude: ["src/**/index.ts", "src/domain/types.ts"],
    },
  },
});
