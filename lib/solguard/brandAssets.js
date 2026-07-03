import { readFile } from "fs/promises";
import path from "path";

export const BRAND_FONT_NAME = "Orbitron";

export async function loadLogoBase64() {
  const logoPath = path.join(process.cwd(), "public/logo.png");
  const buf = await readFile(logoPath);
  return buf.toString("base64");
}

export async function loadBrandFont() {
  const fontPath = path.join(process.cwd(), "public/fonts/Orbitron-Bold.ttf");
  return readFile(fontPath);
}
