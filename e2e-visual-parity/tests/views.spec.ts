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
