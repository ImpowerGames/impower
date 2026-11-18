import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEditorBrowser, openEditorPage, waitForEditor, withEditor, writeMainSd } from "../../.agents/skills/drive-web-editor/driver.mjs";
import { VIEWPORT_PRESETS } from "../../.agents/skills/drive-web-editor/viewport.mjs";

const WIDTHS = [800, 760, 741, 740, 739, 700, 640, 560, 520, 500, 481, 480, 420, 393, 360, 340, 320];
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
    for (const label of required) if (![...shown].some((name) => name === label || name.startsWith(`${label}: `))) found.push(`${label} missing`);
    const folded = group.hasAttribute("data-steps-folded");
    const stepsShown = shown.has("Step") || stepItems.every((label) => shown.has(label));
    if (folded && stepsShown) found.push("step controls left in the bar while folded");
    if (!folded && !stepsShown) found.push("step controls missing");
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
    return { found, folded };
  }, { bar: BAR, width, stepItems: STEP_ITEMS });

const entriesIn = async (page, trigger, scope) => {
  await page.locator(BAR).getByRole("button", { name: trigger, exact: true }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ timeout: 5000 });
  const items = await (scope ? menu.getByRole("group", { name: scope }) : menu).getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached", timeout: 5000 });
  return items;
};

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
      const foldedAt = {};
      for (const width of WIDTHS) {
        await sizePane(page, width);
        await page.waitForTimeout(300);
        const { found, folded } = await problems(page, width);
        foldedAt[width] = folded;
        for (const problem of found) failures.push(`${width} px: ${problem}`);
      }
      assert.deepEqual(failures, []);
      assert.ok(foldedAt[360] && !foldedAt[480], `the Step button folds into the cog menu at 360 and stays in the bar at 480: ${JSON.stringify(foldedAt)}`);
      await sizePane(page, 480);
      await page.waitForTimeout(300);
      const menuItems = await entriesIn(page, "Step");
      for (const label of STEP_ITEMS) assert.ok(menuItems.some((text) => text.startsWith(label)), `Step menu lacks ${label}: ${menuItems.join(" | ")}`);
      await sizePane(page, 360);
      await page.waitForTimeout(300);
      const groupItems = await entriesIn(page, "Preview settings", "Step");
      assert.deepEqual(groupItems, menuItems, "the cog menu's Step group lists the Step menu's entries");
    },
    { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display: { viewport: { name: "desktop", ...VIEWPORT_PRESETS.desktop } } }) },
  );
});
