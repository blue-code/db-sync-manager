import { describe, it, expect } from "vitest";
import { planRestore } from "../src/dump/restore.js";

const dump = [
  "SET FOREIGN_KEY_CHECKS=0;",
  "DROP TABLE IF EXISTS `users`;",
  "CREATE TABLE `users` (`id` int);",
  "INSERT INTO `users` VALUES (1);",
  "SET FOREIGN_KEY_CHECKS=1;",
].join("\n");

describe("planRestore", () => {
  it("옵션 없으면 모든 문장을 실행 대상으로 삼는다", () => {
    expect(planRestore(dump)).toHaveLength(5);
  });

  it("schemaOnly 는 CREATE/DROP 만(SET 은 유지) 남긴다", () => {
    const out = planRestore(dump, { schemaOnly: true });
    expect(out.some((s) => /INSERT/.test(s))).toBe(false);
    expect(out.some((s) => /CREATE TABLE/.test(s))).toBe(true);
    expect(out.some((s) => /DROP TABLE/.test(s))).toBe(true);
    expect(out.some((s) => /^SET/.test(s))).toBe(true);
  });

  it("dataOnly 는 INSERT 만(SET 은 유지) 남긴다", () => {
    const out = planRestore(dump, { dataOnly: true });
    expect(out.some((s) => /INSERT/.test(s))).toBe(true);
    expect(out.some((s) => /CREATE TABLE/.test(s))).toBe(false);
    expect(out.some((s) => /^SET/.test(s))).toBe(true);
  });
});
