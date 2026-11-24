// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderBuiltPages } from "../../vite.config";

const RECORD_FILE = "impower-dev/test/build/editorInlineCssSize.json";

const RECORD: { raw: number; gzip: number; brotli: number } = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL("./editorInlineCssSize.json", import.meta.url)),
    "utf-8",
  ),
);

const COMPRESSOR_VERSION_ALLOWANCE_BYTES = 64;

const builtPageInlineCss = async () => {
  const pages = await renderBuiltPages();
  const editorPage = pages.find(({ src }) => /[\\/]index\.html$/.test(src));
  expect(editorPage, "the build renders no index.html page").toBeDefined();
  const style = editorPage!.html.match(
    /<style id="ssg-css">([\s\S]*?)<\/style>/,
  );
  expect(style, "the built page has no inline ssg-css style").not.toBeNull();
  return Buffer.from(style![1]!, "utf-8");
};

describe("editor page inline CSS size", () => {
  it(
    `stays within the size recorded in ${RECORD_FILE}`,
    async () => {
      const css = await builtPageInlineCss();
      const text = css.toString("utf-8");
      const size = {
        raw: css.length,
        gzip: zlib.gzipSync(css, { level: 9 }).length,
        brotli: zlib.brotliCompressSync(css, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      };
      console.info(
        `editor page inline CSS: ${size.raw} raw, ${size.gzip} gzip, ${size.brotli} brotli bytes (recorded ${RECORD.raw}, ${RECORD.gzip}, ${RECORD.brotli})`,
      );

      expect(text, "Tailwind utilities are missing from the inline CSS").toMatch(
        /\.flex\s*\{\s*display:\s*flex/,
      );
      expect(text, "the inline CSS is not minified").not.toMatch(/\n\s/);
      expect(
        size.raw,
        `the inline CSS grew past the raw bytes recorded in ${RECORD_FILE}; record the new size there if the growth is intended`,
      ).toBeLessThanOrEqual(RECORD.raw);
      expect(
        size.gzip,
        `the inline CSS grew past the gzip bytes recorded in ${RECORD_FILE}; record the new size there if the growth is intended`,
      ).toBeLessThanOrEqual(RECORD.gzip + COMPRESSOR_VERSION_ALLOWANCE_BYTES);
      expect(
        size.brotli,
        `the inline CSS grew past the brotli bytes recorded in ${RECORD_FILE}; record the new size there if the growth is intended`,
      ).toBeLessThanOrEqual(
        RECORD.brotli + COMPRESSOR_VERSION_ALLOWANCE_BYTES,
      );
    },
    120_000,
  );
});
