import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 통합 테스트: 실제 MySQL(임베디드)을 띄운다. 유닛과 분리 실행한다.
    environment: "node",
    include: ["test/integration/**/*.it.test.ts"],
    // 최초 실행은 MySQL 바이너리 다운로드로 오래 걸릴 수 있다.
    hookTimeout: 180000,
    testTimeout: 60000,
    // 단일 인스턴스를 공유하기 위해 파일 간 병렬 실행을 끈다.
    fileParallelism: false,
  },
});
