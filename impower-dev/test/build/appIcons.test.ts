// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const publicDir = resolve(__dirname, "../../src/public");
const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"));
const documentHtml = readFileSync(resolve(publicDir, "document.html"), "utf8");

const pngSize = (bytes: Buffer) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

const icoSize = (bytes: Buffer) => `${bytes.readUInt8(6) || 256}x${bytes.readUInt8(7) || 256}`;

const iconFiles = (): string[] => [
  ...manifest.icons.map((icon: { src: string }) => icon.src),
  "favicon.svg",
  "launch.png",
];

const hashes = () =>
  Object.fromEntries(
    iconFiles().map((name) => [
      name,
      createHash("sha1").update(readFileSync(resolve(publicDir, name))).digest("hex"),
    ]),
  );

describe("app icons", () => {
  it("names the app Spark Engine in the manifest and the document", () => {
    expect(manifest.name).toBe("Spark Engine");
    expect(manifest.short_name).toBe("Spark Engine");
    expect(documentHtml).toContain("<title>Spark Engine</title>");
    expect(documentHtml).toContain('<meta name="apple-mobile-web-app-title" content="Spark Engine" />');
  });

  it.each(manifest.icons.map((icon: { src: string; sizes: string; type: string }) => [icon.src, icon]))(
    "ships %s at its declared size",
    (_src, icon) => {
      const bytes = readFileSync(resolve(publicDir, icon.src));
      if (icon.type === "image/png") {
        expect(pngSize(bytes)).toBe(icon.sizes);
      } else if (icon.type === "image/x-icon") {
        expect(icoSize(bytes)).toBe(icon.sizes);
      } else {
        expect(icon.sizes).toBe("any");
        expect(bytes.toString("utf8")).toMatch(/^<svg /);
      }
    },
  );

  it("links the favicon, the touch icon and the launch image the generator writes", () => {
    for (const href of ["/favicon.ico", "/favicon.svg", "/icon180_maskable.png", "/launch.png"]) {
      expect(documentHtml).toContain(`href="${href}"`);
      expect(iconFiles()).toContain(href.slice(1));
    }
  });

  it("draws the icons as Sparky in Charcoal's accent on Charcoal's background", async () => {
    const themeCss = readFileSync(resolve(__dirname, "../../../packages/impower-ui/src/theme.css"), "utf8");
    const charcoal = themeCss.match(/\[data-theme="charcoal"\][^{]*\{([^}]*)\}/)![1]!;
    const token = (name: string) => charcoal.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})`))![1]!.toLowerCase();
    const { data, info } = await sharp(resolve(publicDir, "icon512_maskable.png")).raw().toBuffer({ resolveWithObject: true });
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += info.channels) {
      colours.add([data[i], data[i + 1], data[i + 2]].map((v) => v!.toString(16).padStart(2, "0")).join(""));
    }
    expect(colours.has(token("bg"))).toBe(true);
    expect(colours.has(token("accent"))).toBe(true);
    expect([data[0], data[1], data[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")).toBe(token("bg"));
  });

  it("draws the launch image as the Made with Spark splash centred on the splash's own background", async () => {
    const splashSource = resolve(__dirname, "../../../packages/impower-ui/src/components/made-with-spark-splash/source/made_with_spark_splash.svg");
    const background = readFileSync(splashSource, "utf8").match(/Background #([0-9a-fA-F]{6})/)![1]!.toLowerCase();
    const { data, info } = await sharp(resolve(publicDir, "launch.png")).raw().toBuffer({ resolveWithObject: true });
    const hex = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]].map((v) => v!.toString(16).padStart(2, "0")).join("");
    };
    expect([info.width, info.height]).toEqual([1290, 2796]);
    expect([hex(0, 0), hex(info.width - 1, info.height - 1)]).toEqual([background, background]);
    const art = await sharp(readFileSync(splashSource), { density: 144 }).resize(info.width).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const top = Math.round((info.height - art.info.height) / 2);
    const region = await sharp(resolve(publicDir, "launch.png"))
      .extract({ left: 0, top, width: info.width, height: art.info.height })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(region.equals(art.data)).toBe(true);
    expect(new Set(Array.from({ length: art.info.width }, (_, x) => hex(x, top + (art.info.height >> 1)))).size).toBeGreaterThan(1);
  });

  it("regenerates every icon without a byte of difference", () => {
    const before = hashes();
    execFileSync(process.execPath, [resolve(__dirname, "../../scripts/generate-icons.mjs")], { stdio: "pipe" });
    expect(hashes()).toEqual(before);
  });
});
