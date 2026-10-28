import type { ProgramAddress } from "../types/ProgramAddress";
import type { ConditionOverride, RoutePlan, RouteStep } from "./planRoute";

/**
 * What the route did at a decision, as the preview reports it:
 * - `auto`: an option the route took at a menu;
 * - `forced`: a verdict the program does not reach there, which the route
 *   forced to reach its target;
 * - `clipped`: a loop the route left before the program would, by whatever
 *   verdict it forced to leave it.
 */
export type RouteDecisionKind = "auto" | "forced" | "clipped";

export interface RouteDecision {
  kind: RouteDecisionKind;
  /** For a choice, the address of the option taken (`Choice.sourcePath`);
   *  for a verdict, the address of the decision it is for. */
  site: ProgramAddress;
  /** The text of the option taken. */
  option?: string;
  /** Which time the route is offered the option it took, from 1. */
  meeting?: number;
  /** The verdict the route forced. */
  verdict?: boolean;
  /** The passes a clipped loop ran before the route left it. */
  passes?: number;
}

/** The script and the line, counting from 0, an address stands on. */
export type LineOf = (
  address: ProgramAddress,
) => { script: number; line: number } | undefined;

/** Whether the verdict `verdict` at the decision `site` is a loop's test
 *  ending the loop: a `while` or `for` test found false, a `repeat` loop's
 *  `until` found true. */
export type EndsLoop = (site: ProgramAddress, verdict: boolean) => boolean;

/** How many of a pass's steps, from its last, are read to find the lines the
 *  pass ran, and how many steps after a verdict are read to find where the
 *  route went: a pass or a stretch longer than that is read in part. */
const STEPS_READ = 4096;

/**
 * The decisions `route` made, in route order: one per menu it met, and one
 * per verdict it forced against the program (`ConditionOverride.departs`).
 * A verdict the program reaches is the program's, and is not listed.
 *
 * A forced verdict is a clipped loop when the route left a loop with it:
 * either it is a loop's test ending the loop (`endsLoop`), on any pass, the
 * first included; or the route met the same decision on the passes before
 * with the other verdict, and the step it went on to stands outside the
 * lines the last of those passes ran (a forced branch that breaks out). The
 * passes are the meetings with the other verdict since the route last met
 * the decision with this one. A verdict that stays inside the loop (a branch
 * in its body the program skips) is forced.
 */
export const routeDecisions = (
  route: RoutePlan,
  lineOf: LineOf,
  endsLoop?: EndsLoop,
): RouteDecision[] => {
  const decisions: RouteDecision[] = [];
  const offers = new Map<string, number>();
  let menus = 0;
  route.decisions.forEach((decision, index) => {
    if (decision.kind === "choice") {
      const menu = route.choices[menus];
      menus += 1;
      for (const source of menu?.sources ?? [decision.value]) {
        offers.set(source, (offers.get(source) ?? 0) + 1);
      }
      decisions.push({
        kind: "auto",
        site: Number(decision.value),
        option: menu?.options[menu.selected] ?? "",
        meeting: offers.get(decision.value) ?? 1,
      });
      return;
    }
    if (!decision.departs) {
      return;
    }
    const passes = clippedPasses(route, index, lineOf, endsLoop);
    decisions.push(
      passes === undefined
        ? { kind: "forced", site: decision.site, verdict: decision.value }
        : {
            kind: "clipped",
            site: decision.site,
            verdict: decision.value,
            passes,
          },
    );
  });
  return decisions;
};

/** The passes of a loop the forced verdict at `index` left, or nothing when
 *  it left none (see {@link routeDecisions}). */
const clippedPasses = (
  route: RoutePlan,
  index: number,
  lineOf: LineOf,
  endsLoop: EndsLoop | undefined,
): number | undefined => {
  const forced = route.decisions[index] as ConditionOverride;
  let passes = 0;
  let lastPass = -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const earlier = route.decisions[i]!;
    if (earlier.kind !== "condition" || earlier.site !== forced.site) {
      continue;
    }
    if (earlier.value === forced.value) {
      break;
    }
    passes += 1;
    if (lastPass < 0) {
      lastPass = i;
    }
  }
  if (endsLoop?.(forced.site, forced.value)) {
    return passes;
  }
  if (passes === 0) {
    return undefined;
  }
  const at = lineOf(forced.site);
  const steps = route.steps;
  const passStart = firstStepAfter(steps, lastPass);
  const passEnd = firstStepAfter(steps, index);
  // Where the route went: the first step past the verdict off its own line.
  let next: { script: number; line: number } | undefined;
  for (let i = passEnd; i < steps.length && i < passEnd + STEPS_READ; i += 1) {
    const line = lineOf(steps[i]!.address);
    if (line && (line.script !== at?.script || line.line !== at.line)) {
      next = line;
      break;
    }
  }
  if (!next) {
    return undefined;
  }
  // The lines the last pass ran in the script the route went on in.
  let min = Infinity;
  let max = -Infinity;
  for (let i = Math.max(passStart, passEnd - STEPS_READ); i < passEnd; i += 1) {
    const line = lineOf(steps[i]!.address);
    if (line && line.script === next.script) {
      min = Math.min(min, line.line);
      max = Math.max(max, line.line);
    }
  }
  return next.line < min || next.line > max ? passes : undefined;
};

/** The index of the first step recorded after decision `decision` was made:
 *  a step records the latest decision made before it, which never falls
 *  along a route. */
const firstStepAfter = (steps: RouteStep[], decision: number): number => {
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid]!.decision >= decision) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};
