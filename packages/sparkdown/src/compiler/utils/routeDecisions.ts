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
  /** The passes a clipped loop ran: the times its body began, the pass it
   *  left part way through included. */
  passes?: number;
  /** The script and first line, counting from 0, of a clipped loop. */
  loop?: { script: number; line: number };
}

/** A loop of a script, counting lines from 0: its first line, the line of
 *  its `end` (or its `until`), and whether it is a `repeat` loop, whose body
 *  runs before its test. */
export interface ScriptLoop {
  header: number;
  end: number;
  repeat: boolean;
}

/** The first and last line of a function's body, counting from 0. */
export interface ScriptBody {
  start: number;
  end: number;
}

/** A script's loops and function bodies (`SparkdownCompiler.structureOf`). */
export interface ScriptStructure {
  loops: readonly ScriptLoop[];
  bodies: readonly ScriptBody[];
}

/** The script and the line, counting from 0, an address stands on. */
export type LineOf = (
  address: ProgramAddress,
) => { script: number; line: number } | undefined;

/** The loops and function bodies of the script with index `script`. */
export type StructureOf = (script: number) => ScriptStructure;

/** How many steps before the route's next decision in a loop's scope are
 *  read to find where it stood, and how many decisions after a verdict are
 *  read to find that decision. */
const STEPS_READ = 4096;
const DECISIONS_READ = 100_000;

/**
 * The decisions `route` made, in route order: one per menu it met, and one
 * per verdict it forced against the program (`ConditionOverride.departs`).
 * A verdict the program reaches is the program's, and is not listed.
 *
 * A forced verdict is a clipped loop when it left the innermost loop around
 * its line: it is that loop's test found false (every loop's test continues
 * on true, a `repeat` loop's too, which the compile turns into a test to go
 * round again), or the route stood outside the loop's lines when it next
 * decided in the loop's scope or reached its target (a forced branch that
 * breaks out). The loop's scope is its script outside any function body
 * that does not hold the loop: a function the route calls from the loop
 * runs elsewhere and returns to it, and where the route stands inside one
 * says nothing about the loop. Any other forced verdict, a branch inside a
 * loop that stays in it included, is forced. The passes are the times the
 * loop's test was met true since the route last met it false, and one more
 * for a `repeat` loop, whose body ran before its first test. Without
 * `structureOf`, every forced verdict is forced.
 */
export const routeDecisions = (
  route: RoutePlan,
  lineOf: LineOf,
  structureOf?: StructureOf,
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
    const clipped = structureOf
      ? clippedLoop(route, index, lineOf, structureOf)
      : undefined;
    decisions.push(
      clipped === undefined
        ? { kind: "forced", site: decision.site, verdict: decision.value }
        : {
            kind: "clipped",
            site: decision.site,
            verdict: decision.value,
            ...clipped,
          },
    );
  });
  return decisions;
};

/** The loop the forced verdict at `index` left and the passes it ran, or
 *  nothing when it left none (see {@link routeDecisions}). */
const clippedLoop = (
  route: RoutePlan,
  index: number,
  lineOf: LineOf,
  structureOf: StructureOf,
): { passes: number; loop: { script: number; line: number } } | undefined => {
  const forced = route.decisions[index] as ConditionOverride;
  const at = lineOf(forced.site);
  if (!at) {
    return undefined;
  }
  const structure = structureOf(at.script);
  // The innermost loop whose lines hold the verdict's.
  let loop: ScriptLoop | undefined;
  for (const candidate of structure.loops) {
    if (
      candidate.header <= at.line &&
      at.line <= candidate.end &&
      (!loop || candidate.header >= loop.header)
    ) {
      loop = candidate;
    }
  }
  if (!loop) {
    return undefined;
  }
  const isTest = (site: ProgramAddress) => {
    const line = lineOf(site);
    return line?.script === at.script && line.line === loop!.header;
  };
  const leaves =
    (isTest(forced.site) && !forced.value) ||
    leftLoop(route, index, at, loop, structure.bodies, lineOf);
  if (!leaves) {
    return undefined;
  }
  // The test met true since the route last met it false, which it does only
  // when it leaves the loop.
  let passes = loop.repeat ? 1 : 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const earlier = route.decisions[i]!;
    if (earlier.kind !== "condition" || !isTest(earlier.site)) {
      continue;
    }
    if (!earlier.value) {
      break;
    }
    passes += 1;
  }
  return { passes, loop: { script: at.script, line: loop.header } };
};

/** Whether the route, where it stood last in `loop`'s scope before its
 *  next decision there after the verdict at `index` (or at its target, when
 *  it made none), stood outside the loop's lines: the verdict took it out of
 *  the loop, through a `break` or past the loop's end, rather than on
 *  through the loop's body. */
const leftLoop = (
  route: RoutePlan,
  index: number,
  at: { script: number; line: number },
  loop: ScriptLoop,
  bodies: readonly ScriptBody[],
  lineOf: LineOf,
): boolean => {
  const elsewhere = bodies.filter(
    (body) => body.start > loop.header || loop.header > body.end,
  );
  const inScope = (line: { script: number; line: number }) =>
    line.script === at.script &&
    !elsewhere.some((body) => body.start <= line.line && line.line <= body.end);
  let next = route.decisions.length;
  for (
    let j = index + 1;
    j < route.decisions.length && j <= index + DECISIONS_READ;
    j += 1
  ) {
    const line = lineOf(route.decisions[j]!.site);
    if (line && inScope(line)) {
      next = j;
      break;
    }
  }
  const steps = route.steps;
  const from = firstStepAfter(steps, index);
  const end =
    next < route.decisions.length ? firstStepAfter(steps, next) : steps.length;
  for (let i = end - 1; i >= from && i >= end - STEPS_READ; i -= 1) {
    const line = lineOf(steps[i]!.address);
    if (!line || !inScope(line)) {
      continue;
    }
    return line.line < loop.header || line.line > loop.end;
  }
  return false;
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
