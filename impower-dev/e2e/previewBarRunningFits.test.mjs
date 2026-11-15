import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEditorBrowser, openEditorPage, waitForEditor, withEditor, writeMainSd } from "../../.agents/skills/drive-web-editor/driver.mjs";
import { VIEWPORT_PRESETS } from "../../.agents/skills/drive-web-editor/viewport.mjs";

const WIDTHS = [800, 760, 741, 740, 739, 700, 640, 560, 520, 500, 481, 480, 420, 360, 340];
const SCRIPT = "scene start\n  Hello from the driver.\n  Second line here.\n  Third line here.\nend\n";
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

const STEP_ITEMS = ["Step Over", "Step Into", "Step Out", "Toggle breakpoint"];

const problems = (page, width) =>
  page.evaluate(({ bar, width, stepItems }) => {
    const group = document.querySelector(bar);
    const box = group.getBoundingClientRect();
    const buttons = [...group.querySelectorAll("button")]
      .map((b) => ({ label: b.getAttribute("aria-label") ?? b.textContent.trim(), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const found = [];
    const shown = new Set(buttons.map(({ label }) => label));
    const required = ["Pause", "Skip back", "Stop", "Skip forward", "Saves", "Preview settings"];
    if (width >= 360) required.push("Viewing mode");
    for (const label of required) if (!shown.has(label)) found.push(`${label} missing`);
    if (!shown.has("Step") && !stepItems.every((label) => shown.has(label))) found.push("step controls missing");
    for (const { label, r } of buttons) {
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5) found.push(`${label} outside the bar`);
    }
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i].r;
        const b = buttons[j].r;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5) found.push(`${buttons[i].label} overlaps ${buttons[j].label}`);
      }
    }
    return found;
  }, { bar: BAR, width, stepItems: STEP_ITEMS });

test("every running-bar button keeps its own slot inside the bar, at every pane width", { timeout: 300_000 }, async () => {
  await withEditor(
    async ({ page, url }) => {
      await openEditorPage(page, url);
      await waitForEditor(page);
      await writeMainSd(page, SCRIPT);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForEditor(page);
      await page.locator(BAR).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: "Play From Here" }).click();
      await page.getByRole("button", { name: /^(Pause|Resume)$/ }).waitFor({ timeout: 30_000 });
      const failures = [];
      for (const width of WIDTHS) {
        await sizePane(page, width);
        await page.waitForTimeout(300);
        for (const problem of await problems(page, width)) failures.push(`${width} px: ${problem}`);
      }
      assert.deepEqual(failures, []);
      await sizePane(page, 360);
      await page.waitForTimeout(300);
      await page.locator(BAR).getByRole("button", { name: "Step", exact: true }).click();
      const items = await page.getByRole("menuitem").allInnerTexts();
      for (const label of STEP_ITEMS) assert.ok(items.some((text) => text.startsWith(label)), `Step menu lacks ${label}: ${items.join(" | ")}`);
    },
    { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: { viewport: { name: "desktop", ...VIEWPORT_PRESETS.desktop } } }) },
  );
});
