import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEditorBrowser, openEditorPage, waitForEditor, withEditor, writeMainSd } from "../../.agents/skills/drive-web-editor/driver.mjs";
import { VIEWPORT_PRESETS } from "../../.agents/skills/drive-web-editor/viewport.mjs";

const WIDTHS = [620, 560, 500, 481, 480, 470, 420, 360, 340];
const SCRIPT = "scene start\n  The lamps come on one by one.\n  The street goes quiet.\n  done\nend\n";
const BAR = '[role="group"][aria-label="Playback controls"]';

const sizePane = (page, width) =>
  page.evaluate(
    ({ bar, width }) => {
      const pane = document.querySelector(bar).parentElement;
      pane.style.width = `${width}px`;
      pane.style.maxWidth = `${width}px`;
      pane.style.flex = "none";
    },
    { bar: BAR, width },
  );

const slot = (page) =>
  page.evaluate((bar) => {
    const group = document.querySelector(bar);
    const left = group.firstElementChild;
    const menu = left.firstElementChild;
    const button = [...left.querySelectorAll("button")].find((b) => !menu.contains(b));
    return {
      label: button.getAttribute("aria-label"),
      left: Math.round((button.getBoundingClientRect().left - group.getBoundingClientRect().left) * 10) / 10,
    };
  }, BAR);

test("the first button after the viewing-mode menu stays put when the game starts, at every bar width", { timeout: 300_000 }, async () => {
  await withEditor(
    async ({ page, url }) => {
      await openEditorPage(page, url);
      await waitForEditor(page);
      await writeMainSd(page, SCRIPT);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForEditor(page);
      await page.locator(BAR).waitFor({ timeout: 30_000 });
      const shifts = [];
      for (const width of WIDTHS) {
        await sizePane(page, width);
        await page.waitForTimeout(300);
        const stopped = await slot(page);
        await page.getByRole("button", { name: "Play From Here" }).click();
        await page.getByRole("button", { name: /^(Pause|Resume)$/ }).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(300);
        const playing = await slot(page);
        await page.getByRole("button", { name: "Stop" }).click();
        await page.getByRole("button", { name: "Play From Here" }).waitFor({ timeout: 30_000 });
        assert.equal(stopped.label, "Replay beat");
        assert.match(playing.label, /^(Pause|Resume)$/);
        if (stopped.left !== playing.left) shifts.push(`${width} px: ${stopped.left} stopped, ${playing.left} playing`);
      }
      assert.deepEqual(shifts, []);
    },
    { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: { viewport: { name: "desktop", ...VIEWPORT_PRESETS.desktop } } }) },
  );
});
