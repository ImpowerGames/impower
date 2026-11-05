import assert from "node:assert/strict";
import { test } from "node:test";
import { withEditor, openEditorPage, waitForEditor } from "../../.agents/skills/drive-web-editor/driver.mjs";

test("loads every Folio UI weight and sets the eyebrow in Open Sans Bold", { timeout: 180_000 }, async () => {
  await withEditor(async ({ page, url }) => {
    await openEditorPage(page, url);
    await waitForEditor(page);
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      for (const weight of [400, 600, 700]) {
        await document.fonts.load(`${weight} 11px "Folio UI"`, "Editor~");
      }
      const faces = [...document.fonts]
        .filter((face) => face.family.replace(/"/g, "") === "Folio UI")
        .map((face) => `${face.weight} ${face.unicodeRange} ${face.status}`);
      const span = document.createElement("span");
      span.style.cssText = 'position: absolute; white-space: nowrap; font: 700 11px "Folio UI", "Folio UI Fallback"; letter-spacing: 1.32px; text-transform: uppercase';
      span.textContent = "Editor & project preferences";
      document.body.append(span);
      const eyebrow = span.getBoundingClientRect().width;
      span.remove();
      return { faces, eyebrow };
    });
    assert.deepEqual(result.faces, [
      "400 U+0-7D, U+7F-10FFFF loaded",
      "600 U+0-7D, U+7F-10FFFF loaded",
      "700 U+0-7D, U+7F-10FFFF loaded",
      "400 U+7E loaded",
      "600 U+7E loaded",
      "700 U+7E loaded",
    ]);
    assert.ok(result.eyebrow >= 213 && result.eyebrow <= 214.5, `eyebrow measured ${result.eyebrow}px`);
  });
});
