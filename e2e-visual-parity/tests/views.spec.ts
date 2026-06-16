import { expect, test } from "@playwright/test";
import { BASIC_FIXTURE } from "../fixtures/basic";
import { MULTI_FIXTURE } from "../fixtures/multi";
import { loadAllowlist } from "../helpers/allowlist";
import { h } from "../helpers/handles";
import {
  compareCheckpoint,
  setupStacks,
  type StackPage,
} from "../helpers/parity-fixture";
import { awaitStable } from "../helpers/stability";

/**
 * Breadth-discovery scenarios: navigate both stacks to a view, capture + measure
 * the diff (artifacts written), but DON'T hard-gate yet — the point is to find
 * where the port diverges more from main so we know where the real parity work
 * is. Tagged @views (excluded from @smoke).
 */
async function clickBoth(a: StackPage, b: StackPage, locate: (sp: StackPage) => Promise<void>) {
  for (const sp of [a, b]) {
    await locate(sp);
    await awaitStable(sp.page);
  }
}

async function discover(scenario: string, a: StackPage, b: StackPage) {
  const r = await compareCheckpoint(
    scenario,
    { id: "full", maxDiffRatio: 1 }, // discovery: never gate on ratio
    a,
    b,
    loadAllowlist(),
    new Date(),
  );
  const px = r.pixel.sizeMismatch
    ? `SIZE MISMATCH ${r.pixel.sizeMismatch.a.join("x")} vs ${r.pixel.sizeMismatch.b.join("x")}`
    : `${(r.pixel.ratio * 100).toFixed(3)}% mismatch`;
  console.log(`[${scenario}] ${px}`);
  return r;
}

test("@views Assets view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Assets").click());
    const r = await discover("assets-view", a, b);
    expect(r.pixel.mismatch).not.toBe(-1); // both captured at equal size (or logged)
  } finally {
    await dispose();
  }
});

test("@views Scripts list view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
    await discover("scripts-view", a, b);
  } finally {
    await dispose();
  }
});

test("@views Share view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Share").click());
    await discover("share-view", a, b);
  } finally {
    await dispose();
  }
});

// --- Interactions (open menus/drawers via existing role/aria handles) ---
test("@views Header menu drawer", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) =>
      sp.page.getByRole("button", { name: "Open Menu" }).click(),
    );
    await discover("menu-drawer", a, b);
  } finally {
    await dispose();
  }
});

// At desktop width both panes show side-by-side; "Toggle Preview" is the
// mobile-only pane switcher (<960px). The game/screenplay mode is switched via
// the "Preview Screenplay" (Notes icon) button in the game-preview toolbar,
// present in both apps.
// NOTE: this currently reports ~35% because the BASELINE doesn't render the
// formatted screenplay in the harness's stripped-down prod build (empty player
// origin + seeded local project) — its preview pane stays empty — while the
// PORT renders it correctly (verified visually). So this is a baseline-render
// limitation of the harness, NOT a port parity failure. Kept as discovery
// (non-gating) and documented; revisit if the baseline can be made to render
// the screenplay in-harness.
test("@views Preview screenplay (desktop)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    for (const sp of [a, b]) {
      await sp.page.getByRole("button", { name: "Preview Screenplay" }).first().click();
    }
    // The screenplay preview loads its formatted content asynchronously (after
    // the program compiles). Wait for BOTH preview panes to actually render
    // screenplay text before comparing, so we don't capture one mid-load.
    for (const sp of [a, b]) {
      await sp.page
        .locator("sparkdown-screenplay-preview, .sparkdown-screenplay-preview-root")
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {});
      await sp.page.waitForTimeout(1500);
    }
    await discover("preview-screenplay", a, b);
  } finally {
    await dispose();
  }
});

// FIXME: unreliable — interaction-determinism, NOT a handle problem. Both apps
// expose aria-label="Options" (port Radix dropdown trigger; baseline s-button
// #more), so the handle resolves. But the dropdown is transient and the
// populated-list row behavior diverges (the capture can land with the script
// opened in the port rather than the dropdown reliably open in both), so the
// result is a divergent state, not a real visual diff. Needs deterministic
// dropdown handling (assert-open + hold) — not a testid. Skipped for now.
test.fixme("@views File options menu", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
    // Open the first row's options and wait for the dropdown to actually be
    // open in BOTH apps (its "Rename" item visible) before capturing, so we
    // don't catch one mid-open / in a divergent state.
    for (const sp of [a, b]) {
      await sp.page.getByRole("button", { name: "Options" }).first().click();
      await sp.page
        .getByText("Rename", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
    }
    await discover("file-options-menu", a, b);
  } finally {
    await dispose();
  }
});

// Populated project: multiple scripts + assets, to exercise list/row rendering.
test("@views Assets view (populated)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Assets").click());
    await discover("assets-populated", a, b);
  } finally {
    await dispose();
  }
});

test("@views Scripts list (populated)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
    await discover("scripts-populated", a, b);
  } finally {
    await dispose();
  }
});
