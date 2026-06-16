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
      { name: "header-title", at: (p) => p.getByText("Parity Fixture").first(), props: TEXT_PROPS },
      { name: "subtab-main", at: (p) => p.getByRole("tab", { name: "Main" }), props: TEXT_PROPS },
      { name: "subtab-scripts", at: (p) => p.getByRole("tab", { name: "Scripts" }), props: TEXT_PROPS },
      { name: "nav-logic", at: (p) => p.getByRole("tab", { name: "Logic" }), props: TEXT_PROPS },
      { name: "nav-assets", at: (p) => p.getByRole("tab", { name: "Assets" }), props: TEXT_PROPS },
      { name: "nav-share", at: (p) => p.getByRole("tab", { name: "Share" }), props: TEXT_PROPS },
      { name: "game-preview-label", at: (p) => p.getByText("Game Preview").first(), props: TEXT_PROPS },
    ],
  },
];

test("@smoke allowlist.yaml is valid", () => {
  const issues = validateAllowlist(loadAllowlist(), new Date());
  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
});

test("@smoke shell parity (hydrated default Logic view)", async ({ browser }) => {
  const al = loadAllowlist();
  const now = new Date();
  const { a, b, dispose } = await setupStacks(browser, BASIC_FIXTURE);
  try {
    // Gate on the VISUAL (pixel) layer. Computed-style deltas are informational:
    // cross-app the two design systems apply colors via different tokens and
    // mechanisms (e.g. opacity vs color), so exact CSS parity isn't achievable
    // or the goal — visual parity is. The harness proved this: aligning the fg
    // token to one of main's colors moved zero pixels (the diffs are sub-
    // threshold + main's palette is non-uniform).
    const pixelFailures: string[] = [];
    for (const cp of CHECKPOINTS) {
      const r = await compareCheckpoint(SCENARIO, cp, a, b, al, now);
      console.log(
        `[${cp.id}] pixel ${(r.pixel.ratio * 100).toFixed(3)}% (<=${(r.pixel.maxDiffRatio * 100).toFixed(2)}%) ${r.pixel.pass ? "PASS" : "FAIL"}`,
      );
      if (!r.pixel.pass) pixelFailures.push(...r.failures.filter((f) => /pixel/.test(f)));
      for (const p of r.probes) {
        if (p.unresolved) {
          console.log(`    (info) probe '${p.name}' unresolved baseline=${p.unresolved.baseline} port=${p.unresolved.port}`);
        }
        for (const d of p.kept ?? []) {
          console.log(`    (info) ${p.name}.${d.prop}: baseline=${d.baseline} port=${d.port}`);
        }
      }
    }
    expect(pixelFailures, `\nvisual (pixel) parity failures:\n${pixelFailures.join("\n")}`).toEqual([]);
  } finally {
    await dispose();
  }
});
