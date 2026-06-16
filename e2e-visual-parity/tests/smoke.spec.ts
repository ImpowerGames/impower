import { expect, test } from "@playwright/test";
import { BASIC_FIXTURE } from "../fixtures/basic";
import {
  alwaysMask,
  finishAnimations,
  FREEZE_CSS,
  initScript,
  SHOT_OPTS,
} from "../helpers/determinism";
import { comparePixels, writePixelArtifacts } from "../helpers/pixel-diff";
import { seedProject } from "../helpers/seed";
import { awaitStable } from "../helpers/stability";
import { diffStyles, readComputed } from "../helpers/style-diff";
import { BASE_PROPS, BASELINE, CONTEXT_OPTS, PORT, type Stack } from "../parity.config";

/**
 * P0 thin vertical slice: seed both stacks to an identical project, settle,
 * neutralize animation, capture both, and run BOTH assertion layers. The point
 * is to prove the harness runs end-to-end and produces a diff report — not yet
 * to enforce parity gates (that arrives with the allowlist in P1/P2).
 */
test("@smoke blank-load parity", async ({ browser }) => {
  const setup = async (stack: Stack) => {
    const ctx = await browser.newContext(CONTEXT_OPTS);
    await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    await seedProject(page, stack.origin, BASIC_FIXTURE);
    await awaitStable(page);
    await page.addStyleTag({ content: FREEZE_CSS });
    await finishAnimations(page);
    return { ctx, page };
  };

  const a = await setup(BASELINE);
  const b = await setup(PORT);

  try {
    // --- Layer A: pixel diff (full viewport, standing masks) ---
    const aBuf = await a.page.screenshot({ ...SHOT_OPTS, mask: alwaysMask(a.page) });
    const bBuf = await b.page.screenshot({ ...SHOT_OPTS, mask: alwaysMask(b.page) });
    const res = comparePixels(aBuf, bBuf);
    const dir = writePixelArtifacts("blank-load", "full", aBuf, bBuf, res);
    if (res.sizeMismatch) {
      console.log(
        `[blank-load] SIZE MISMATCH baseline=${res.sizeMismatch.a.join("x")} port=${res.sizeMismatch.b.join("x")} → ${dir}`,
      );
    } else {
      console.log(
        `[blank-load] pixel: ${(res.ratio * 100).toFixed(3)}% mismatch (${res.mismatch}px / ${res.width}x${res.height}) → ${dir}`,
      );
    }

    // --- Layer B: computed-style diff (bottom-nav tablist) ---
    const probeA = a.page.locator('[role="tablist"]').first();
    const probeB = b.page.locator('[role="tablist"]').first();
    if ((await probeA.count()) && (await probeB.count())) {
      const sa = await readComputed(probeA, BASE_PROPS);
      const sb = await readComputed(probeB, BASE_PROPS);
      const deltas = diffStyles(sa, sb);
      console.log(`[blank-load] tablist computed-style deltas (${deltas.length}):`);
      for (const d of deltas) console.log(`    ${d.prop}: baseline=${d.baseline}  port=${d.port}`);
    } else {
      console.log("[blank-load] tablist not found in one of the stacks (counts:",
        await probeA.count(), await probeB.count(), ")");
    }

    // P0 gate: the machinery ran end-to-end on both stacks.
    expect(aBuf.length, "baseline screenshot captured").toBeGreaterThan(0);
    expect(bBuf.length, "port screenshot captured").toBeGreaterThan(0);
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});
