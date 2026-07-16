// icon.svg → 여러 크기 PNG → icon.ico (Windows 앱 아이콘).
// 미리보기용 icon-256.png 도 함께 남긴다.
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(join(here, "icon.svg"));

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()),
);

// 미리보기 PNG 저장(256)
await writeFile(join(here, "icon-256.png"), pngs[0]);

const ico = await pngToIco(pngs);
await writeFile(join(here, "icon.ico"), ico);
console.log(`[make-icon] icon.ico (${ico.length} bytes), sizes: ${sizes.join(",")}`);
