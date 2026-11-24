import { imageSizeFixtures } from "@impower/sparkdown/src/tests/morph/imageSizeFixtures";
import { IMAGE_HEADER_BYTES, imageSizeOf } from "@impower/sparkdown/src/workspace/utils/imageSize";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

describe("image header sizes against Chromium's decoder (#2630)", () => {
  it("decodes every fixture at its recorded size, and the reader gives that size or none", async () => {
    const fixtures = imageSizeFixtures();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const decoded = await page.evaluate(
        async (items) =>
          Promise.all(
            items.map(async ({ mime, data }) => {
              const image = new Image();
              image.src = `data:${mime};base64,${data}`;
              try {
                await image.decode();
                return { width: image.naturalWidth, height: image.naturalHeight };
              } catch {
                return null;
              }
            }),
          ),
        fixtures.map(({ mime, bytes }) => ({ mime, data: Buffer.from(bytes).toString("base64") })),
      );
      const table = fixtures.map((fixture, index) => ({
        name: fixture.name,
        decoded: decoded[index],
        read: imageSizeOf(fixture.bytes.subarray(0, IMAGE_HEADER_BYTES)) ?? null,
      }));
      expect(table.map(({ name, decoded }) => ({ name, decoded }))).toEqual(
        fixtures.map(({ name, decoded }) => ({ name, decoded })),
      );
      expect(table.filter(({ read, decoded }) => read !== null && JSON.stringify(read) !== JSON.stringify(decoded))).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
