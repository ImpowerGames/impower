import assert from "node:assert/strict";
import { test } from "node:test";
import {
  launchEditorBrowser,
  openEditorPage,
  hidePreview,
  placeCaret,
  reclaimDriverPreview,
  revealPreview,
  waitForEditor,
  withEditor,
  writeMainSd,
} from "../../.agents/skills/drive-web-editor/driver.mjs";

const WIDTHS = [320, 360, 375, 390, 393, 412, 430, 480];
const SCRIPT = `scene start\n  Hello from the driver.\n${Array.from({ length: 40 }, (_, i) => `  Line ${i + 2} of the story.\n`).join("")}end\n`;
const BAR = '[role="group"][aria-label="Playback controls"]';
const STEP_ENTRIES = ["Step Over", "Step Into", "Step Out", "Toggle breakpoint"];

const layout = (page) =>
  page.evaluate((bar) => {
    const group = document.querySelector(bar);
    const box = group.getBoundingClientRect();
    const controls = [...group.querySelectorAll("button")]
      .map((button) => ({ label: button.getAttribute("aria-label"), r: button.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ label, r }) => ({ label, left: r.left - box.left, right: r.right - box.left, width: r.width, height: r.height }));
    return { width: box.width, folded: group.hasAttribute("data-steps-folded"), controls };
  }, BAR);

const problemsOf = ({ width, folded, controls }, running) => {
  const found = [];
  const labels = new Set(controls.map(({ label }) => label));
  const required = [running ? /^(Pause|Resume)$/ : /^Replay beat$/, /^Skip back$/, running ? /^Stop$/ : /^Play From Here$/, /^Skip forward$/, /^Saves$/, /^Preview settings$/];
  if (width >= 360) required.push(/^Viewing mode: /);
  for (const pattern of required) if (![...labels].some((label) => pattern.test(label))) found.push(`${pattern.source} missing`);
  if (running && folded === labels.has("Step")) found.push(folded ? "Step left in the bar while folded" : "Step missing from the bar");
  for (const { label, left, right, width: w, height } of controls) {
    if (w < 44 || height < 44) found.push(`${label} is ${w}x${height}`);
    if (left < -0.5 || right > width + 0.5) found.push(`${label} outside the bar`);
  }
  for (let i = 0; i < controls.length; i++)
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlap > 0.5) found.push(`${a.label} overlaps ${b.label} by ${overlap}`);
    }
  const centre = controls.find(({ label }) => label === (running ? "Stop" : "Play From Here"));
  if (centre && (folded || !running) && Math.abs((centre.left + centre.right) / 2 - width / 2) > 0.5) {
    found.push(`${centre.label} is ${(centre.left + centre.right) / 2 - width / 2}px off the bar's centre`);
  }
  return found;
};

const resize = async (page, width) => {
  await page.setViewportSize({ width, height: 780 });
  await page.waitForTimeout(400);
};

const openMenu = async (page, name) => {
  await page.locator(BAR).getByRole("button", { name, exact: true }).tap();
  const menu = page.getByRole("menu");
  await menu.waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  return menu;
};

const closeMenu = async (page) => {
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached", timeout: 5000 });
};

const stepEntriesIn = async (page, menu, grouped) => {
  const scope = grouped ? menu.getByRole("group", { name: "Step" }) : menu;
  const labels = await scope.getByRole("menuitem").allInnerTexts();
  return STEP_ENTRIES.filter((entry) => !labels.some((text) => text.startsWith(entry)));
};

const breakpoints = (page) => page.locator(".cm-breakpoint").count();

const position = (page) =>
  page.evaluate(() => [...document.querySelectorAll("button")].map((button) => button.innerText.trim()).map((text) => /main\s*:\s*\d+/.exec(text)?.[0]).find(Boolean) ?? null);

const recordFrames = (page) =>
  page.evaluate((bar) => {
    const frames = [];
    window.__barFrames = frames;
    const tick = () => {
      const group = document.querySelector(bar);
      if (group?.hasAttribute("data-running")) {
        frames.push({
          width: group.getBoundingClientRect().width,
          folded: group.hasAttribute("data-steps-folded"),
          step: !!group.querySelector('button[aria-label="Step"]'),
          balance: !!group.querySelector("[data-step-balance]"),
        });
      }
      if (frames.length < 120) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, BAR);

const opening = async (page, how) => {
  const cog = page.locator(BAR).getByRole("button", { name: "Preview settings" });
  if (how === "tap") await cog.tap();
  else await cog.click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    const scrollers = [];
    for (let e = menu; e && e !== document.body; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1) scrollers.push(e.scrollTop);
    const first = menu.querySelector('[role^="menuitem"]:not([disabled]):not([data-disabled])');
    const head = menu.firstElementChild.getBoundingClientRect();
    const view = menu.getBoundingClientRect();
    return {
      sheet: !!menu.closest('[role="dialog"]'),
      scrollers,
      focused: document.activeElement?.textContent?.trim().slice(0, 40) ?? null,
      first: first?.textContent?.trim().slice(0, 40) ?? null,
      headInView: head.top >= view.top - 0.5 && head.bottom <= view.bottom + 0.5,
    };
  });
  await closeMenu(page);
  return state;
};

const tapEntry = async (page, menu, entry) => {
  await menu.getByRole("menuitem").filter({ hasText: entry }).first().tap();
  await page.getByRole("menu").waitFor({ state: "detached", timeout: 5000 });
};

test("the phone preview bar keeps every control a separate 44px target at every phone width, running and stopped, and keeps the Step entries reachable", { timeout: 600_000 }, async () => {
  const display = { viewport: { name: "375x780", width: 375, height: 780, touch: true }, colorScheme: null, theme: "charcoal" };
  await withEditor(
    async ({ page, url, cleanups }) => {
      await openEditorPage(page, url);
      await waitForEditor(page);
      const reclaimed = await reclaimDriverPreview(page);
      assert.ok(reclaimed === null || reclaimed.restored, `an earlier run's preview pane: ${reclaimed?.reason}`);
      const hideAgain = async () => {
        await page.setViewportSize({ width: 375, height: 780 });
        await page.waitForTimeout(400);
        return hidePreview(page);
      };
      cleanups.push(hideAgain);
      await writeMainSd(page, SCRIPT);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForEditor(page);
      const caret = await placeCaret(page, { line: 2, col: 3 });
      assert.ok(caret.placed, `caret: ${caret.reason}`);
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Play from this line"]');
        return button && !button.disabled;
      }, null, { timeout: 30_000 });
      await recordFrames(page);
      const shown = await revealPreview(page);
      assert.equal(shown.reason, undefined);
      await page.getByRole("button", { name: /^(Pause|Resume)$/ }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      const frames = await page.evaluate(() => window.__barFrames);
      assert.ok(frames.length > 0, "frames of the running bar were recorded");
      assert.deepEqual(
        frames.filter((frame) => frame.step || frame.balance || !frame.folded),
        [],
        `from its first running frame at 375 px the bar is folded, with no Step button or balance slot (${frames.length} frames)`,
      );

      const openings = {};
      const openAt = async (width) => {
        await resize(page, width);
        for (const how of ["tap", "click"]) openings[`${width} ${how}`] = await opening(page, how);
      };
      await openAt(375);
      assert.match(openings["375 tap"].first, /^Toggle breakpoint/, "while playing at 375 the first enabled entry is the Step group's Toggle breakpoint");

      const failures = [];
      const foldedAt = {};
      for (const width of WIDTHS) {
        await resize(page, width);
        const running = await layout(page);
        foldedAt[width] = running.folded;
        const problems = problemsOf(running, true);
        for (const problem of problems) failures.push(`${width} px running: ${problem}`);
        if (problems.length) continue;
        const menu = await openMenu(page, running.folded ? "Preview settings" : "Step");
        for (const missing of await stepEntriesIn(page, menu, running.folded)) failures.push(`${width} px: ${missing} not in the ${running.folded ? "cog menu's Step group" : "Step menu"}`);
        await closeMenu(page);
      }
      assert.ok(foldedAt[360] && !foldedAt[480], `the Step button folds into the cog menu at 360 and stays in the bar at 480: ${JSON.stringify(foldedAt)}`);

      await resize(page, 360);
      const before = await breakpoints(page);
      await tapEntry(page, await openMenu(page, "Preview settings"), "Toggle breakpoint");
      await page.waitForTimeout(500);
      assert.equal(await breakpoints(page), before + 1, "Toggle breakpoint in the cog menu's Step group sets a breakpoint");
      await resize(page, 480);
      await tapEntry(page, await openMenu(page, "Step"), "Toggle breakpoint");
      await page.waitForTimeout(500);
      assert.equal(await breakpoints(page), before, "Toggle breakpoint in the Step menu clears it again");

      await resize(page, 360);
      await page.locator(BAR).getByRole("button", { name: "Pause" }).tap();
      await page.locator(BAR).getByRole("button", { name: "Resume" }).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500);
      const paused = await opening(page, "tap");
      assert.match(paused.focused ?? "", /^Step Over/, "while paused the cog sheet's first focus is Step Over");
      const cog = await openMenu(page, "Preview settings");
      const stepOver = cog.getByRole("group", { name: "Step" }).getByRole("menuitem").filter({ hasText: "Step Over" });
      await page.waitForFunction(
        () => [...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.startsWith("Step Over") && !item.hasAttribute("disabled") && !item.hasAttribute("data-disabled")),
        null,
        { timeout: 10_000 },
      );
      const placed = await position(page);
      await stepOver.tap();
      await page.getByRole("menu").waitFor({ state: "detached", timeout: 5000 });
      await page.locator(BAR).getByRole("button", { name: "Resume" }).waitFor({ timeout: 10_000 });
      await page.waitForFunction(
        ({ was }) => ([...document.querySelectorAll("button")].map((button) => button.innerText.trim()).map((text) => /main\s*:\s*\d+/.exec(text)?.[0]).find(Boolean) ?? null) !== was,
        { was: placed },
        { timeout: 10_000 },
      ).catch(() => {});
      const after = await position(page);
      assert.ok(placed && after && after !== placed, `Step Over from the cog menu's Step group moves the story on: ${placed} then ${after}`);

      await page.locator(BAR).getByRole("button", { name: "Stop" }).tap();
      await page.locator(BAR).getByRole("button", { name: "Play From Here" }).waitFor({ timeout: 15_000 });
      for (const width of WIDTHS) {
        await resize(page, width);
        for (const problem of problemsOf(await layout(page), false)) failures.push(`${width} px stopped: ${problem}`);
      }
      assert.deepEqual(failures, []);

      await openAt(1440);
      for (const [at, state] of Object.entries(openings)) {
        assert.equal(state.sheet, at.endsWith("tap"), `${at}: a finger opens the sheet and a mouse the dropdown`);
        assert.deepEqual(state.scrollers.filter((top) => top !== 0), [], `${at}: the cog menu opens scrolled to its top`);
        assert.ok(state.headInView, `${at}: the cog menu's first heading or entry is fully in view`);
        assert.equal(state.focused, state.first, `${at}: first focus is the cog menu's first enabled entry`);
      }
      const hidden = await hideAgain();
      assert.ok(hidden.hidden, `the preview pane this test revealed is hidden again: ${hidden.reason}`);
    },
    { device: null, launch: ({ headless }) => launchEditorBrowser({ headless, display }) },
  );
});
