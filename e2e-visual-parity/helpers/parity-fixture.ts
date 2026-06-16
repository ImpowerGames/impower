import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  BASE_PROPS,
  BASELINE,
  CONTEXT_OPTS,
  PIXEL,
  PORT,
  REPORT_DIR,
  type Stack,
} from "../parity.config";
import {
  applyStyleAllowlist,
  pixelEntriesFor,
  type Allowlist,
} from "./allowlist";
import {
  alwaysMask,
  finishAnimations,
  FREEZE_CSS,
  initScript,
  SHOT_OPTS,
} from "./determinism";
import { comparePixels, type Rect, writePixelArtifacts } from "./pixel-diff";
import { seedProject, type Fixture } from "./seed";
import { awaitStable } from "./stability";
import { diffStyles, readComputed, type StyleDelta } from "./style-diff";

export interface StackPage {
  stack: Stack;
  ctx: BrowserContext;
  page: Page;
}

export interface Probe {
  /** Logical name — also the `selector` key the allowlist matches against. */
  name: string;
  at: (p: Page) => Locator;
  /**
   * Per-app locator overrides. When the two apps carry the same VISIBLE style
   * on structurally-different nodes (e.g. the port's `<Tab>` crossfades two
   * label copies, so the `role="tab"` button inherits the container color while
   * the baseline's `role="tab"` carries the label color directly), point each
   * app at the node that actually renders the style. Falls back to `at`.
   */
  atBaseline?: (p: Page) => Locator;
  atPort?: (p: Page) => Locator;
  props?: string[];
}

export interface Checkpoint {
  id: string;
  /** Element clip for the pixel capture; omit for full-viewport. */
  target?: (p: Page) => Locator;
  /** Extra masks beyond the standing set (§6.4). */
  mask?: (p: Page) => Locator[];
  maxDiffRatio?: number;
  probes?: Probe[];
}

export interface ProbeResult {
  name: string;
  unresolved?: { baseline: number; port: number };
  kept?: StyleDelta[];
  suppressed?: { delta: StyleDelta; by: string }[];
}

export interface CheckpointResult {
  id: string;
  pixel: {
    ratio: number;
    maxDiffRatio: number;
    mismatch: number;
    sizeMismatch?: { a: [number, number]; b: [number, number] };
    pass: boolean;
  };
  probes: ProbeResult[];
  appliedEntries: string[];
  failures: string[];
}

/** Seed + settle + freeze both stacks for a scenario. */
export async function setupStacks(browser: Browser, fixture: Fixture) {
  const setup = async (stack: Stack): Promise<StackPage> => {
    const ctx = await browser.newContext(CONTEXT_OPTS);
    await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    await seedProject(page, stack.origin, fixture);
    await awaitStable(page);
    await page.addStyleTag({ content: FREEZE_CSS });
    await finishAnimations(page);
    return { stack, ctx, page };
  };
  const a = await setup(BASELINE);
  const b = await setup(PORT);
  return {
    a,
    b,
    dispose: async () => {
      await a.ctx.close();
      await b.ctx.close();
    },
  };
}

/** Bounding box of `selector` expressed in the captured target's coordinate
 *  space (for pixel-region allowlist suppression). */
async function regionRectInTarget(
  page: Page,
  selector: string,
  target: Page | Locator,
): Promise<Rect | null> {
  const el = page.locator(selector).first();
  if (!(await el.count())) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  if ("screenshot" in target && "boundingBox" in target) {
    const tb = await (target as Locator).boundingBox();
    if (tb) return { x: box.x - tb.x, y: box.y - tb.y, width: box.width, height: box.height };
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function writeStyleArtifacts(scenario: string, checkpoint: string, probes: ProbeResult[]) {
  const dir = path.join(REPORT_DIR, "style-diffs", scenario);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${checkpoint}.json`),
    JSON.stringify({ probes }, null, 2),
  );
}

/** Run one checkpoint across both stacks: pixel + computed-style, allowlist-
 *  suppressed, artifacts written. Returns the result with any unsuppressed
 *  failures. */
export async function compareCheckpoint(
  scenario: string,
  cp: Checkpoint,
  a: StackPage,
  b: StackPage,
  al: Allowlist,
  now: Date,
): Promise<CheckpointResult> {
  const applied = new Set<string>();
  const failures: string[] = [];

  // --- Layer A: pixel ---
  const tA: Page | Locator = cp.target ? cp.target(a.page) : a.page;
  const tB: Page | Locator = cp.target ? cp.target(b.page) : b.page;
  const maskA = [...alwaysMask(a.page), ...(cp.mask?.(a.page) ?? [])];
  const maskB = [...alwaysMask(b.page), ...(cp.mask?.(b.page) ?? [])];
  const aBuf = await tA.screenshot({ ...SHOT_OPTS, mask: maskA });
  const bBuf = await tB.screenshot({ ...SHOT_OPTS, mask: maskB });

  const suppressRects: Rect[] = [];
  for (const e of pixelEntriesFor(al, scenario, cp.id, now)) {
    if (e.scope.region) {
      suppressRects.push(e.scope.region);
      applied.add(e.id);
    } else if (e.scope.region_selector) {
      const rect = await regionRectInTarget(b.page, e.scope.region_selector, tB);
      if (rect) {
        suppressRects.push(rect);
        applied.add(e.id);
      }
    }
  }

  const res = comparePixels(aBuf, bBuf, { suppressRects });
  const maxDiffRatio = cp.maxDiffRatio ?? PIXEL.maxDiffRatio;
  writePixelArtifacts(scenario, cp.id, aBuf, bBuf, res, {
    maxDiffRatio,
    allowlistApplied: [...applied],
  });
  const pixelPass = !res.sizeMismatch && res.ratio <= maxDiffRatio;
  if (res.sizeMismatch) {
    failures.push(`[${cp.id}] pixel SIZE MISMATCH baseline=${res.sizeMismatch.a.join("x")} port=${res.sizeMismatch.b.join("x")}`);
  } else if (!pixelPass) {
    failures.push(`[${cp.id}] pixel ${(res.ratio * 100).toFixed(3)}% > ${(maxDiffRatio * 100).toFixed(3)}%`);
  }

  // --- Layer B: computed-style ---
  const probeResults: ProbeResult[] = [];
  for (const probe of cp.probes ?? []) {
    const la = (probe.atBaseline ?? probe.at)(a.page);
    const lb = (probe.atPort ?? probe.at)(b.page);
    const [ca, cb] = [await la.count(), await lb.count()];
    if (!ca || !cb) {
      probeResults.push({ name: probe.name, unresolved: { baseline: ca, port: cb } });
      failures.push(`[${cp.id}] probe '${probe.name}' unresolved (baseline=${ca} port=${cb})`);
      continue;
    }
    const sa = await readComputed(la.first(), probe.props ?? BASE_PROPS);
    const sb = await readComputed(lb.first(), probe.props ?? BASE_PROPS);
    const sup = applyStyleAllowlist(
      diffStyles(sa, sb),
      { scenario, checkpoint: cp.id, selector: probe.name },
      al,
      now,
    );
    sup.applied.forEach((id) => applied.add(id));
    probeResults.push({ name: probe.name, kept: sup.kept, suppressed: sup.suppressed });
    for (const d of sup.kept) {
      failures.push(`[${cp.id}] ${probe.name}.${d.prop}: baseline=${d.baseline} port=${d.port}`);
    }
  }
  writeStyleArtifacts(scenario, cp.id, probeResults);

  return {
    id: cp.id,
    pixel: {
      ratio: res.ratio,
      maxDiffRatio,
      mismatch: res.mismatch,
      sizeMismatch: res.sizeMismatch,
      pass: pixelPass,
    },
    probes: probeResults,
    appliedEntries: [...applied],
    failures,
  };
}
