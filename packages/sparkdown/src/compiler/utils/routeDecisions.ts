import type { ProgramAddress } from "../types/ProgramAddress";
import type { ConditionOverride, RoutePlan, RouteStep } from "./planRoute";
import {
  NO_PINS,
  pinnedAtMenu,
  pinnedNotOffered,
  type PinnedOptions,
} from "./routePins";

export type RouteDecisionKind = "pinned" | "auto" | "forced" | "clipped";

export interface RouteOption {
  site: ProgramAddress;
  text: string;
  offer: number;
  pinned?: true;
}

export interface RouteDecision {
  kind: RouteDecisionKind;
  site: ProgramAddress;
  option?: string;
  meeting?: number;
  menu?: ProgramAddress;
  options?: RouteOption[];
  notFollowed?: true;
  unoffered?: { site: ProgramAddress; offer: number }[];
  verdict?: boolean;
  passes?: number;
  loop?: { script: number; line: number };
}

export interface ScriptLoop {
  header: number;
  end: number;
  repeat: boolean;
}

export interface ScriptBody {
  start: number;
  end: number;
}

export interface ScriptStructure {
  loops: readonly ScriptLoop[];
  bodies: readonly ScriptBody[];
}

export type LineOf = (
  address: ProgramAddress,
) => { script: number; line: number } | undefined;

export type StructureOf = (script: number) => ScriptStructure;

const STEPS_READ = 4096;
const DECISIONS_READ = 100_000;

export const routeDecisions = (
  route: RoutePlan,
  lineOf: LineOf,
  structureOf?: StructureOf,
  pinned: PinnedOptions = NO_PINS,
): RouteDecision[] => {
  const decisions: RouteDecision[] = [];
  const offers = new Map<string, number>();
  const missed = new Set<string>();
  const offeredAt = new Map<ProgramAddress, Set<string>>();
  let menus = 0;
  route.decisions.forEach((decision, index) => {
    if (decision.kind === "choice") {
      const menu = route.choices[menus];
      menus += 1;
      const sources = menu?.sources ?? [decision.value];
      const pinnedHere = new Set(
        pinnedAtMenu(pinned, sources, offers).map((i) => sources[i]!),
      );
      let notFollowed = [...pinnedHere].some((s) => s !== decision.value);
      const unoffered: { site: ProgramAddress; offer: number }[] = [];
      let offeredBefore = offeredAt.get(decision.site);
      if (!offeredBefore) {
        offeredBefore = new Set();
        offeredAt.set(decision.site, offeredBefore);
      }
      for (const { source, offer } of pinnedNotOffered(
        pinned,
        sources,
        offers,
        offeredBefore,
      )) {
        const key = `${source}:${offer}`;
        if (!missed.has(key)) {
          missed.add(key);
          notFollowed = true;
          unoffered.push({ site: Number(source), offer });
        }
      }
      for (const source of sources) {
        offers.set(source, (offers.get(source) ?? 0) + 1);
        offeredBefore.add(source);
      }
      decisions.push({
        kind: pinnedHere.has(decision.value) ? "pinned" : "auto",
        site: Number(decision.value),
        option: menu?.options[menu.selected] ?? "",
        meeting: offers.get(decision.value) ?? 1,
        menu: decision.site,
        options: sources.map((source, i) => ({
          site: Number(source),
          text: menu?.options[i] ?? "",
          offer: offers.get(source) ?? 1,
          ...(pinnedHere.has(source) ? { pinned: true as const } : {}),
        })),
        ...(notFollowed ? { notFollowed: true as const } : {}),
        ...(unoffered.length > 0 ? { unoffered } : {}),
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
