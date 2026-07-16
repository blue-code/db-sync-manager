import { describe, it, expect } from "vitest";
import { addRecent, connKey, type RecentConnection } from "../src/connector/recentConnections.js";

const c = (host: string, database = "app"): RecentConnection => ({ host, port: 3306, user: "root", database });

describe("addRecent", () => {
  it("새 항목을 맨 앞에 넣는다", () => {
    const out = addRecent([c("a")], c("b"));
    expect(out.map((x) => x.host)).toEqual(["b", "a"]);
  });

  it("같은 대상은 중복 제거 후 최신으로 올린다", () => {
    const out = addRecent([c("a"), c("b")], c("a"));
    expect(out.map((x) => x.host)).toEqual(["a", "b"]);
    expect(out).toHaveLength(2);
  });

  it("host/port/user/database 가 모두 같아야 같은 대상으로 본다", () => {
    const out = addRecent([c("a", "db1")], c("a", "db2"));
    expect(out).toHaveLength(2); // database 가 달라 별개
  });

  it("최대 개수를 넘으면 오래된 것을 버린다", () => {
    let list: RecentConnection[] = [];
    for (let i = 0; i < 15; i++) list = addRecent(list, c(`h${i}`), 10);
    expect(list).toHaveLength(10);
    expect(list[0]!.host).toBe("h14"); // 최신
  });

  it("connKey 는 대상을 유일하게 식별한다", () => {
    expect(connKey(c("a"))).toBe("a:3306/root@app");
  });
});
