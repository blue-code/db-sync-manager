/**
 * 자격증명 볼트(Electron safeStorage).
 *
 * 예약 자동 실행에 필요한 비밀번호를 OS 보안 저장소로 암호화해 보관한다.
 * 평문 저장은 하지 않는다 — 암호화가 불가한 환경에서는 저장을 거부한다.
 * 저장 형식: userData/vault.json = { "<taskId>:<role>": base64(encrypted) }
 */

import { safeStorage } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

type VaultFile = Record<string, string>;

export class Vault {
  constructor(private filePath: string) {}

  /** OS 보안 저장소 사용 가능 여부. */
  available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  private async load(): Promise<VaultFile> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as VaultFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  /** 비밀번호를 암호화해 저장한다. */
  async set(key: string, plaintext: string): Promise<void> {
    if (!this.available()) throw new Error("OS 보안 저장소를 사용할 수 없어 비밀번호를 저장할 수 없습니다.");
    const data = await this.load();
    data[key] = safeStorage.encryptString(plaintext).toString("base64");
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data), "utf8");
  }

  /** 저장된 비밀번호를 복호화해 돌려준다(없으면 null). */
  async get(key: string): Promise<string | null> {
    if (!this.available()) return null;
    const b64 = (await this.load())[key];
    if (!b64) return null;
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  }
}
