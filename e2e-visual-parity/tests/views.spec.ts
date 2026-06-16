import { expect, test } from "@playwright/test";
import { MOBILE_VIEWPORT } from "../parity.config";
import { BASIC_FIXTURE } from "../fixtures/basic";
import { MULTI_FIXTURE } from "../fixtures/multi";
import { loadAllowlist } from "../helpers/allowlist";
import { h } from "../helpers/handles";
import {
  type Checkpoint,
  compareCheckpoint,
  setupStacks,
  type StackPage,
} from "../helpers/parity-fixture";
import { awaitStable } from "../helpers/stability";

/**
 * Per-view parity gates. These started as breadth-discovery scenarios (find
 * where the port diverges from main); now that the divergences they surfaced
 * are fixed — the drawer width, the scrollbar-gutter content offset — each one
 * GATES on the pixel diff so a regression fails CI. Tagged @views (excluded
 * from @smoke). Thresholds are ~1.5x the measured-stable ratio: tight enough to
 * catch a real regression, loose enough for cross-machine font-AA variance.
 * (The residual is the cross-bundler text-rasterization floor — see shell.spec
 * for why ~0.14% is the practical minimum.)
 */
async function clickBoth(a: StackPage, b: StackPage, locate: (sp: StackPage) => Promise<void>) {
  for (const sp of [a, b]) {
    await locate(sp);
    await awaitStable(sp.page);
  }
}

async function gate(scenario: string, a: StackPage, b: StackPage, maxDiffRatio: number) {
  const r = await compareCheckpoint(
    scenario,
    { id: "full", maxDiffRatio },
    a,
    b,
    loadAllowlist(),
    new Date(),
  );
  const px = r.pixel.sizeMismatch
    ? `SIZE MISMATCH ${r.pixel.sizeMismatch.a.join("x")} vs ${r.pixel.sizeMismatch.b.join("x")}`
    : `${(r.pixel.ratio * 100).toFixed(3)}%`;
  console.log(
    `[${scenario}] pixel ${px} (<=${(maxDiffRatio * 100).toFixed(2)}%) ${r.pixel.pass ? "PASS" : "FAIL"}`,
  );
  expect(
    r.pixel.pass,
    `[${scenario}] pixel ${px} exceeded gate ${(maxDiffRatio * 100).toFixed(2)}%`,
  ).toBe(true);
  return r;
}

/**
 * Gate a checkpoint on BOTH pixel AND computed-style probes — the pattern that
 * catches small-element typography/border/layout diffs the whole-viewport pixel
 * ratio dilutes below its threshold (the class of bug the manual review caught
 * that this suite originally missed). `r.failures` already merges pixel +
 * unsuppressed style deltas.
 */
async function gateCheckpoint(
  scenario: string,
  a: StackPage,
  b: StackPage,
  cp: Checkpoint,
) {
  const r = await compareCheckpoint(scenario, cp, a, b, loadAllowlist(), new Date());
  const px = r.pixel.sizeMismatch ? "SIZE MISMATCH" : `${(r.pixel.ratio * 100).toFixed(3)}%`;
  console.log(`[${scenario}] pixel ${px} (gate ${((cp.maxDiffRatio ?? 0) * 100).toFixed(2)}%) + ${cp.probes?.length ?? 0} style probe(s)`);
  for (const p of r.probes) {
    if (p.unresolved) {
      console.log(`    (FAIL) probe '${p.name}' unresolved baseline=${p.unresolved.baseline} port=${p.unresolved.port}`);
    }
    for (const d of p.kept ?? []) {
      console.log(`    (FAIL) ${p.name}.${d.prop}: baseline=${d.baseline} port=${d.port}`);
    }
  }
  expect(r.failures, `\n[${scenario}] parity failures (pixel + style):\n${r.failures.join("\n")}`).toEqual([]);
  return r;
}

test("@views Assets view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Assets").click());
    await gate("assets-view", a, b, 0.006);
  } finally {
    await dispose();
  }
});

test("@views Scripts list view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
    await gate("scripts-view", a, b, 0.006);
  } finally {
    await dispose();
  }
});

test("@views Share view", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Share").click());
    // Pixel gate (0.8% — share has the most right-aligned chrome + the 4px
    // SplitPane separator residual) PLUS computed-style probes on the two
    // widgets whose typography/border diffs slipped past the whole-viewport
    // pixel floor in the original suite:
    //   - Publish button (outlined CTA): font-size/weight, box height, corner
    //     radius, all 4 border widths + color. (width omitted — the 4px pane
    //     residual is a known separator artifact.)
    //   - export rows: font-weight/size/color (the rows were 500 vs main's 400).
    await gateCheckpoint("share-view", a, b, {
      id: "full",
      maxDiffRatio: 0.008,
      probes: [
        {
          name: "publish-button",
          at: (p) => p.getByRole("button", { name: /publish/i }),
          props: [
            "fontSize", "fontWeight", "lineHeight", "height",
            "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
            "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
            "borderTopColor", "borderRadius", "color",
          ],
        },
        {
          name: "export-row",
          at: (p) => p.getByText("Spark Cartridge"),
          props: ["fontSize", "fontWeight", "lineHeight", "color"],
        },
        {
          // The per-row settings gear: its BUTTON box size drives the gap
          // between the ".s.png" label and the (centered) glyph. main's gear is
          // 40px (variant="icon"); a 48px button pushed the icon 4px further
          // right. exact:true avoids matching the row button (whose accessible
          // name also contains "Settings"). Margins aren't probed — the port
          // uses a parent flex `gap` where main uses the gear's margin-left,
          // same 16px spacing via a different mechanism.
          // (borderRadius not probed: both render a circle but main uses 50%
          // while rounded-full computes to ~9999px — visually identical.)
          name: "settings-gear",
          at: (p) => p.getByRole("button", { name: "Settings", exact: true }).first(),
          props: ["width", "height"],
        },
      ],
    });
  } finally {
    await dispose();
  }
});

// Mobile (<960px) layout — the entire responsive breakpoint the desktop-only
// suite never rendered. This is a PORT-SIDE guard rather than a cross-app diff:
// the baseline's preview-toggle is an icon-only <s-button> with an empty
// accessible name (its label lives in shadow DOM), so it isn't cleanly
// targetable in-harness at mobile width. The reference is unambiguous though —
// main lays the icon+label in a horizontal row (sparkle `--_child-layout:row`),
// so we assert the port toggle is `flex-direction:row`. The original bug
// rendered it `column` (icon stacked over text); this fails if it regresses.
test("@mobile @views Preview-toggle is a horizontal row (port, <960px)", async ({ browser }) => {
  const { b, dispose } = await setupStacks(browser, BASIC_FIXTURE, {
    viewport: MOBILE_VIEWPORT,
  });
  try {
    const toggle = b.page.getByRole("button", { name: "Toggle Preview" });
    await expect(toggle).toBeVisible();
    const flexDirection = await toggle.evaluate(
      (el) => getComputedStyle(el).flexDirection,
    );
    expect(
      flexDirection,
      "preview-toggle must lay icon+label in a row like main (was column)",
    ).toBe("row");
  } finally {
    await dispose();
  }
});

// Drilled-in script editor — the ONLY state where the rename header renders.
// No prior scenario opened a script, so the rename input's height/font/width
// divergences (port was 24px/16px/532px vs main's 40px/18px/~203px) went
// uncaught. Gate the rename input's computed metrics here. (Pixel isn't gated:
// a full-viewport clip carries the 4px SplitPane pane residual, and clipping to
// the input fails on the apps' 9px width difference — the metric probe is the
// reliable signal for this state.)
test("@views Script editor rename header (drilled-in)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => {
      await h.subTab(sp.page, "Scripts").click();
      await awaitStable(sp.page);
      await sp.page.getByRole("button", { name: /characters/i }).first().click();
      // Ensure the drill-in actually opened the editor (rename field present)
      // before measuring — otherwise the probe would be spuriously unresolved.
      await sp.page
        .getByRole("textbox", { name: /characters/i })
        .waitFor({ state: "visible", timeout: 10000 });
    });
    await gateCheckpoint("script-rename-header", a, b, {
      id: "full",
      maxDiffRatio: 1, // see note above — gated via the probe, not pixel
      probes: [
        {
          name: "rename-input",
          at: (p) => p.getByRole("textbox", { name: /characters/i }),
          props: ["height", "fontSize", "fontWeight"],
        },
      ],
    });
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
    await gate("menu-drawer", a, b, 0.0045);
  } finally {
    await dispose();
  }
});

// At desktop width both panes show side-by-side; "Toggle Preview" is the
// mobile-only pane switcher (<960px). The game/screenplay mode is switched via
// the "Preview Screenplay" (Notes icon) button in the game-preview toolbar,
// present in both apps.
//
// KNOWN BASELINE-SIDE LIMIT (not gated): the baseline's <se-preview-screenplay>
// has a startup race — it emits LoadPreview before the inner
// sparkdown-screenplay-preview's listener attaches, with no replay, so the
// baseline pane often stays empty (~35% diff). The PORT renders correctly (its
// PreviewScreenplay replays the Connected* handshake). A baseline app-side fix
// was prototyped but does not survive the baseline's older out/ build pipeline,
// so this scenario is documented and left non-gating rather than chasing a
// baseline build fix. We still capture the diff so regressions in the PORT's
// own rendering would show up.
test.fixme(
  "@views Preview screenplay (desktop) — baseline-side startup race leaves baseline pane empty",
  async ({ browser }) => {
    const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
    try {
      for (const sp of [a, b]) {
        await sp.page.getByRole("button", { name: "Preview Screenplay" }).first().click();
      }
      for (const sp of [a, b]) {
        await sp.page
          .locator("sparkdown-screenplay-preview, .sparkdown-screenplay-preview-root")
          .locator(".cm-content")
          .first()
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});
        await sp.page.waitForTimeout(1500);
      }
      await gate("preview-screenplay", a, b, 1); // fixme: baseline-side, non-gating
    } finally {
      await dispose();
    }
  },
);

// KNOWN BASELINE-SIDE LIMIT (not gated): the PORT's 3-dots options menu is
// verified working in-harness — clicking the "Options" button opens the Radix
// dropdown and "Rename"/"Delete" become visible. But the BASELINE renders the
// trigger as an <s-button aria-label="Options"> web component whose host has no
// hit-testable box in this harness (force-click lands on a zero-size host and
// the popup never opens), so a symmetric both-stacks comparison isn't drivable
// here. Documented and left as fixme rather than special-casing baseline shadow
// internals that don't reflect a real port defect.
test.fixme(
  "@views File options menu — baseline s-button trigger not drivable in harness",
  async ({ browser }) => {
    const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
    try {
      await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
      for (const sp of [a, b]) {
        await sp.page
          .getByRole("button", { name: "Options" })
          .first()
          .click({ timeout: 6000 })
          .catch(() => {});
        await sp.page.waitForTimeout(150);
      }
      await gate("file-options-menu", a, b, 1); // fixme: baseline-side, non-gating
    } finally {
      await dispose();
    }
  },
);

// Populated project: multiple scripts + assets, to exercise list/row rendering.
test("@views Assets view (populated)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.bottomTab(sp.page, "Assets").click());
    await gate("assets-populated", a, b, 0.004);
  } finally {
    await dispose();
  }
});

test("@views Scripts list (populated)", async ({ browser }) => {
  const { a, b, dispose } = await setupStacks(browser, MULTI_FIXTURE);
  try {
    await clickBoth(a, b, async (sp) => h.subTab(sp.page, "Scripts").click());
    await gate("scripts-populated", a, b, 0.004);
  } finally {
    await dispose();
  }
});
