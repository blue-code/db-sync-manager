// 렌더러 정적 자산(HTML/CSS/JS)을 빌드 산출물로 복사한다.
// tsc 는 .ts 만 처리하므로 정적 파일은 별도로 옮겨야 한다.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "renderer");
const dest = join(here, "..", "dist-app", "app", "renderer");

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-renderer] ${src} -> ${dest}`);
