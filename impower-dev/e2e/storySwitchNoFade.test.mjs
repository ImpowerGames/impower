import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEditorBrowser, openEditorPage, waitForEditor, withEditor, writeMainSd } from "../../.agents/skills/drive-web-editor/driver.mjs";
import { VIEWPORT_PRESETS } from "../../.agents/skills/drive-web-editor/viewport.mjs";

const SCRIPT = [
  "define MARA as character with",
  "  color = red",
  "end",
  "",
  ...Array.from({ length: 40 }, (_, i) => [`scene PLACE_${i}`, "  The lamps come on one by one.", "  MARA: We should go.", "end", ""]).flat(),
].join("\n");

const display = (name) => ({ viewport: { name, ...VIEWPORT_PRESETS[name] } });

const goTo = (page, hash) =>
  page.evaluate((hash) => {
    location.hash = hash;
  }, hash);

const logFramesAfterSwitch = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        const start = performance.now();
        const sample = () => {
          const editor = document.querySelector(".sparkdown-script-editor-root .editor");
          const content = document.querySelector(".sparkdown-script-editor-root .cm-content");
          const style = editor ? getComputedStyle(editor) : null;
          frames.push({
            ms: Math.round(performance.now() - start),
            editor: !!editor,
            visibility: style?.visibility ?? null,
            opacity: style ? Number(style.opacity) : null,
            chars: content?.innerText.trim().length ?? 0,
          });
          if (performance.now() - start < 2000) requestAnimationFrame(sample);
          else resolve(frames);
        };
        location.hash = "#story";
        requestAnimationFrame(sample);
      }),
  );

for (const name of ["desktop", "phone-large"]) {
  test(`switching from Settings to Story at ${name} draws the script at full opacity in the frame it first shows`, { timeout: 300_000 }, async () => {
    await withEditor(
      async ({ page, url }) => {
        await openEditorPage(page, url);
        await waitForEditor(page);
        await writeMainSd(page, SCRIPT);
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForEditor(page);
        await goTo(page, "#settings");
        await page.waitForFunction(() => !document.querySelector(".sparkdown-script-editor-root .cm-content"), null, { timeout: 15_000 });
        await page.waitForTimeout(1_000);
        const frames = await logFramesAfterSwitch(page);
        const shown = frames.filter((f) => f.editor && f.visibility === "visible" && f.chars > 0 && f.opacity > 0);
        assert.ok(shown.length > 0, `the script never showed: ${JSON.stringify(frames)}`);
        const partial = shown.filter((f) => f.opacity < 1);
        assert.deepEqual(partial, [], `frames drawing the script below full opacity: ${JSON.stringify(frames)}`);
      },
      { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: display(name) }) },
    );
  });
}
