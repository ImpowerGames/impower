// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("regenerates every icon without a byte of difference", () => {
    const before = hashes();
    execFileSync(process.execPath, [resolve(__dirname, "../../scripts/generate-icons.mjs")], { stdio: "pipe" });
    expect(hashes()).toEqual(before);
  });
});
