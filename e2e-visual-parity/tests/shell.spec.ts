import { expect, test } from "@playwright/test";
import { BASIC_FIXTURE } from "../fixtures/basic";
import { loadAllowlist, validateAllowlist } from "../helpers/allowlist";
import { h } from "../helpers/handles";
import {
  compareCheckpoint,
  setupStacks,
  type Checkpoint,
} from "../helpers/parity-fixture";

const SCENARIO = "shell-hydrated-default-logic";

// Text-rendering-relevant properties (the diff is concentrated on chrome text).
const TEXT_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle",
  "letterSpacing", "lineHeight", "textTransform", "color", "transform",
];

// The port's <Tab> renders TWO crossfaded label copies (inactive: text-engine-500
// = #5b799a; active: text-tab-foreground = #f2f2f2 — the exact colors main uses),
// so the `role="tab"` button itself carries NO visible color (it inherits the
// container's white) and Tailwind `text-sm`'s 20px line-height. The baseline's
// `role="tab"` element carries the label color/leading directly. To compare the
// SAME visible style cross-app, point the port probe at the rendered label copy:
// the active copy for the selected tab, the inactive copy otherwise. (The copies'
// color is static regardless of runtime state, so this is robust.)
const portLabel = (name: string, state: "active" | "inactive") =>
  (p: import("@playwright/test").Page) =>
    p
      .getByRole("tab", { name })
      .locator(state === "active" ? ".text-tab-foreground" : ".text-engine-500")
      .filter({ hasText: name });

const CHECKPOINTS: Checkpoint[] = [
  {
    // Whole editor. Gate just above the cross-bundler rasterization floor
    // (~0.14%) so real visual regressions fail but font-AA noise passes.
    id: "full-viewport",
    maxDiffRatio: 0.005,
    probes: [
      { name: "project-name-input", at: h.projectName, props: ["fontSize", "fontWeight", "color"] },
      { name: "sync-caption", at: h.syncCaption, props: ["fontSize", "color"] },
      { name: "editor", at: h.editor, props: ["fontFamily", "fontSize", "lineHeight", "backgroundColor"] },
      // Chrome text shown as diffs in diff.png — classify real-style vs rasterization.
      // (The project name renders as an <input> value, not text content, so it
      // can't be probed via getByText — `project-name-input` above covers its
      // typography through the textbox role.)
      // Default view = Logic pane / Main sub-tab. Logic + Main are active; the
      // rest inactive. `atPort` retargets to the visible label copy (see above).
      { name: "subtab-main", at: (p) => p.getByRole("tab", { name: "Main" }), atPort: portLabel("Main", "active"), props: TEXT_PROPS },
      { name: "subtab-scripts", at: (p) => p.getByRole("tab", { name: "Scripts" }), atPort: portLabel("Scripts", "inactive"), props: TEXT_PROPS },
      { name: "nav-logic", at: (p) => p.getByRole("tab", { name: "Logic" }), atPort: portLabel("Logic", "active"), props: TEXT_PROPS },
      { name: "nav-assets", at: (p) => p.getByRole("tab", { name: "Assets" }), atPort: portLabel("Assets", "inactive"), props: TEXT_PROPS },
      { name: "nav-share", at: (p) => p.getByRole("tab", { name: "Share" }), atPort: portLabel("Share", "inactive"), props: TEXT_PROPS },
      { name: "game-preview-label", at: (p) => p.getByText("Game Preview").first(), props: TEXT_PROPS },
    ],
  },
];

test("@smoke allowlist.yaml is valid", () => {
  const issues = validateAllowlist(loadAllowlist(), new Date());
  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
});

// Port-side invariant: the editor's critical theme tokens must RESOLVE, and the
// host (`#root`) must paint the navy panel color — not its gray `#1f1f1f`
// fallback. A dropped token (e.g. a stray `*/` in a CSS comment that ate
// `--theme-color-panel`) silently falls back behind every transparent panel,
// a whole-chrome regression the pixel diff barely registers (the host is mostly
// panel-COVERED in the seeded checkpoints). This guards the entire "CSS var
// silently resolved to its fallback" class regardless of exposed area, and is
// port-only because the baseline paints the navy on a different element.
test("@smoke port theme tokens resolve (no fallback gray)", async ({ browser }) => {
  const { b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    const result = await b.page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const tokens = [
        "--theme-color-panel",
        "--theme-color-editor-bg",
        "--theme-color-primary-bg",
        "--theme-color-scrollbar-thumb",
        "--color-engine-900",
        "--color-foreground",
        "--color-popup",
      ];
      const empty = tokens.filter((t) => !cs.getPropertyValue(t).trim());
      const root = document.getElementById("root");
      return { empty, rootBg: root ? getComputedStyle(root).backgroundColor : null };
    });
    expect(
      result.empty,
      `theme tokens failed to resolve (empty — likely a dropped CSS var): ${result.empty.join(", ")}`,
    ).toEqual([]);
    expect(
      result.rootBg,
      "host #root must paint the navy panel color, not the gray #1f1f1f fallback",
    ).not.toBe("rgb(31, 31, 31)");
  } finally {
    await dispose();
  }
});

test("@smoke shell parity (hydrated default Logic view)", async ({ browser }) => {
  const al = loadAllowlist();
  const now = new Date();
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    // Gate on BOTH layers:
    //   • pixel — the whole-viewport visual diff (the primary signal).
    //   • computed-style — exact CSS parity on the probed text properties.
    // The style layer is now clean: every probe targets the node that carries
    // the visible style in each app (see `portLabel` — the port's <Tab> renders
    // the label color on a nested crossfade copy, not the role="tab" button), so
    // the probed colors (#5b799a inactive / #f2f2f2 active), leading, and font
    // metrics match main exactly. Gating here catches a real chrome-text or
    // tab-color regression that stays under the pixel threshold.
    const failures: string[] = [];
    for (const cp of CHECKPOINTS) {
      const r = await compareCheckpoint(SCENARIO, cp, a, b, al, now);
      console.log(
        `[${cp.id}] pixel ${(r.pixel.ratio * 100).toFixed(3)}% (<=${(r.pixel.maxDiffRatio * 100).toFixed(2)}%) ${r.pixel.pass ? "PASS" : "FAIL"}`,
      );
      failures.push(...r.failures);
      for (const p of r.probes) {
        if (p.unresolved) {
          console.log(`    (FAIL) probe '${p.name}' unresolved baseline=${p.unresolved.baseline} port=${p.unresolved.port}`);
        }
        for (const d of p.kept ?? []) {
          console.log(`    (FAIL) ${p.name}.${d.prop}: baseline=${d.baseline} port=${d.port}`);
        }
      }
    }
    expect(failures, `\nparity failures (pixel + computed-style):\n${failures.join("\n")}`).toEqual([]);
  } finally {
    await dispose();
  }
});
