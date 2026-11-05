import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "src/public");
const sourceDir = resolve(root, "../packages/impower-ui/src/components/spark-logo/source");
const themeCss = readFileSync(resolve(root, "../packages/impower-ui/src/theme.css"), "utf8");

const themeValue = (theme, name) => {
  const block = themeCss.match(new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`))?.[1];
  const value = block?.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1];
  if (!value) {
    throw new Error(`theme.css declares no hex --${name} for ${theme}`);
  }
  return value.toLowerCase();
};

const background = themeValue("charcoal", "bg");
const accent = themeValue("charcoal", "accent");

const cutout = readFileSync(resolve(sourceDir, "spark_engine_logo_cutout.svg"), "utf8");
const sparkyPath = cutout.match(/<path d="([^"]+)"/)?.[1];
if (!sparkyPath) {
  throw new Error("spark_engine_logo_cutout.svg has no path");
}

const MARK_BOX = { x: 180, y: 104, size: 792 };

const iconSvg = ({ markScale, backdrop }) => {
  const box = MARK_BOX.size / markScale;
  const x = MARK_BOX.x + (648 - box) / 2;
  const y = MARK_BOX.y + (MARK_BOX.size - box) / 2;
  const fill =
    backdrop === "full"
      ? `<rect x="${x}" y="${y}" width="${box}" height="${box}" fill="${background}"/>`
      : backdrop === "rounded"
        ? `<rect x="${x}" y="${y}" width="${box}" height="${box}" rx="${box * 0.22}" fill="${background}"/>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${box} ${box}">${fill}<path d="${sparkyPath}" fill="${accent}" fill-rule="evenodd"/></svg>\n`;
};

const ANY = iconSvg({ markScale: 0.72, backdrop: "rounded" });
const MASKABLE = iconSvg({ markScale: 0.56, backdrop: "full" });
const FAVICON = iconSvg({ markScale: 1, backdrop: "none" });

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 64) })
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

const ico = (image, size) => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, image]);
};

const manifestPath = resolve(publicDir, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const written = [];
const write = (name, content) => {
  writeFileSync(resolve(publicDir, name), content);
  written.push(name);
};

for (const icon of manifest.icons) {
  const size = Number(icon.sizes.split("x")[0]);
  const maskable = icon.purpose === "maskable";
  if (icon.type === "image/png") {
    write(icon.src, await png(maskable ? MASKABLE : ANY, size));
  } else if (icon.type === "image/svg+xml") {
    write(icon.src, maskable ? MASKABLE : ANY);
  } else if (icon.type === "image/x-icon") {
    write(icon.src, ico(await png(FAVICON, size), size));
  } else {
    throw new Error(`No renderer for manifest icon type ${icon.type}`);
  }
}

write("favicon.svg", FAVICON);

const splash = readFileSync(resolve(sourceDir, "made_with_spark_splash.svg"));
const splashBackground = readFileSync(resolve(sourceDir, "made_with_spark_splash.svg"), "utf8").match(
  /Background (#[0-9a-fA-F]{6})/,
)?.[1];
if (!splashBackground) {
  throw new Error("made_with_spark_splash.svg names no background colour");
}
const LAUNCH = { width: 1290, height: 2796 };
const art = await sharp(splash, { density: 144 }).resize(LAUNCH.width).png().toBuffer();
const artHeight = (await sharp(art).metadata()).height;
write(
  "launch.png",
  await sharp({
    create: { width: LAUNCH.width, height: LAUNCH.height, channels: 3, background: splashBackground },
  })
    .composite([{ input: art, top: Math.round((LAUNCH.height - artHeight) / 2), left: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer(),
);

console.log(written.join("\n"));
