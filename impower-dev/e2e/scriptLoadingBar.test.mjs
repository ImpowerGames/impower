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

const logFrames = (page, open) =>
  page.evaluate(
    (open) =>
      new Promise((resolve) => {
        const frames = [];
        const start = performance.now();
        const sample = () => {
          const root = document.querySelector(".sparkdown-script-editor-root");
          const editor = root?.querySelector(".editor");
          const content = root?.querySelector(".cm-content");
          const bar = root?.querySelector('[role="progressbar"]');
          const shown = !!editor && getComputedStyle(editor).visibility === "visible" && (content?.innerText.trim().length ?? 0) > 0;
          frames.push({
            ms: Math.round(performance.now() - start),
            root: !!root,
            shown,
            bar: bar ? Number(getComputedStyle(bar).opacity) : null,
          });
          if (performance.now() - start < 2000) requestAnimationFrame(sample);
          else resolve(frames);
        };
        if (open === "scripts") document.querySelector('button[aria-label^="Open script Main"]').click();
        else location.hash = "#story";
        requestAnimationFrame(sample);
      }),
    open,
  );

const checkFrames = (frames) => {
  const mounted = frames.filter((f) => f.root);
  assert.ok(mounted.length > 0, `the script editor never mounted: ${JSON.stringify(frames)}`);
  const firstShown = frames.findIndex((f) => f.shown);
  assert.ok(firstShown >= 0, `the script never showed: ${JSON.stringify(frames)}`);
  const empty = frames.slice(0, firstShown).filter((f) => f.root);
  assert.ok(empty.length > 0, `no frame showed the editor empty, so the check saw nothing: ${JSON.stringify(frames)}`);
  assert.deepEqual(
    empty.filter((f) => f.bar !== 1),
    [],
    `frames with an empty script body and no loading bar: ${JSON.stringify(frames)}`,
  );
  assert.deepEqual(
    frames.slice(firstShown + 1).filter((f) => f.bar !== 0),
    [],
    `frames after the first shown one with the loading bar still visible: ${JSON.stringify(frames)}`,
  );
};

const leaveFor = async (page, from) => {
  if (from === "scripts") {
    await page.evaluate(() => {
      location.hash = "#scripts";
    });
    await page.locator('button[aria-label^="Open script Main"]').first().waitFor({ state: "visible", timeout: 10_000 });
  } else {
    await page.evaluate((from) => {
      location.hash = `#${from}`;
    }, from);
  }
  await page.waitForFunction(() => !document.querySelector(".sparkdown-script-editor-root .cm-content"), null, { timeout: 15_000 });
  await page.waitForTimeout(1_000);
};

for (const name of ["desktop", "phone-large"]) {
  test(`the script editor's loading bar shows in every frame its body is empty, at ${name}`, { timeout: 600_000 }, async () => {
    await withEditor(
      async ({ page, url }) => {
        await openEditorPage(page, url);
        await waitForEditor(page);
        await writeMainSd(page, SCRIPT);
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForEditor(page);
        for (const from of ["settings", "assets", "share", "scripts"]) {
          await leaveFor(page, from);
          const frames = await logFrames(page, from === "scripts" ? "scripts" : "story");
          console.log(`${name} ${from}: ${JSON.stringify(frames.slice(0, 12))}`);
          checkFrames(frames);
        }
      },
      { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: display(name) }) },
    );
  });
}
