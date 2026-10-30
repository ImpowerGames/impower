import type { Simulator,SimulatorSnapshot } from "../../runtime/Simulator";
import { ErrorType } from "../../runtime/Error";
import type { ProgramStory as Story } from "../../program/ProgramStory";
import { StepLimitExceeded } from "../../runtime/StoryException";
import { imageDigest, type ProgramImage } from "../../program/ProgramImages";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { chunkOfAddress } from "../../program/ProgramChunk";
import { TOP_LEVEL_START, type ProgramAddress } from "../types/ProgramAddress";
import { planRouteFallback } from "./planRouteFallback";
import {
  gateWinsMenu,
  NO_PINS,
  pinnedAtMenu,
  pinnedOfferCounts,
  pinnedOfferKey,
  pinsNextOffer,
  type PinnedOptions,
} from "./routePins";

export interface RoutePlan {
  from: string;
  to: ProgramAddress;
  steps: RouteStep[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  levelZero?: LevelZeroBound;
  fallback?: true;
  pins?: string;
}

export interface RouteChoice {
  options: string[];
  selected: number;
  sources?: string[];
}

export interface LevelZeroBound {
  startSteps: number;
  steps: number;
  nodes: number;
}

export type SearchState = string | ProgramImage;

interface Trail<T> {
  readonly prev: Trail<T> | null;
  readonly items: readonly T[];
  readonly count: number;
  readonly length: number;
}

const extendTrail = <T>(
  prev: Trail<T> | null,
  items: readonly T[],
  count = items.length,
): Trail<T> | null =>
  count === 0
    ? prev
    : { prev, items, count, length: (prev?.length ?? 0) + count };

const trailLength = <T>(trail: Trail<T> | null): number => trail?.length ?? 0;

const flattenTrail = <T>(trail: Trail<T> | null): T[] => {
  const parts: Trail<T>[] = [];
  for (let part = trail; part; part = part.prev) {
    parts.push(part);
  }
  const all: T[] = [];
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]!;
    for (let j = 0; j < part.count; j += 1) {
      all.push(part.items[j]!);
    }
  }
  return all;
};

export interface SearchNode {
  state: SearchState;
  seq: string;
  steps: Trail<RouteStep> | null;
  decisions: Trail<RouteOverride> | null;
  conditions: Trail<{ selected: boolean }> | null;
  choices: Trail<RouteChoice> | null;
  overrides: RouteOverride[];
  forced: number;
  left: number;
  metPins: readonly string[];
  route: number;
}

let lastRoute = 0;
const newRoute = (): number => (lastRoute += 1);

export const faithfulBudget = {
  nodes: 4_096,
  steps: 150_000,
  timeoutMs: 20_000,
};

export const LEVEL_SHARE = 0.25;

export const PIN_SHARE = 0.5;

export const RUN_TURN_STEPS = 16_384;

export const extendSeq = (
  seq: string,
  path: ProgramAddress | string,
): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let piece = seq ? 0 : 2; piece < 3; piece += 1) {
    if (piece === 2 && typeof path === "number") {
      const low = path % 4294967296;
      const high = (path - low) / 4294967296;
      h1 = Math.imul(h1 ^ low, 2654435761);
      h2 = Math.imul(h2 ^ low, 1597334677);
      h1 = Math.imul(h1 ^ high, 2654435761);
      h2 = Math.imul(h2 ^ high, 1597334677);
      continue;
    }
    const text = piece === 0 ? seq : piece === 1 ? "|" : (path as string);
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return String.fromCharCode(h1 & 0xffff, h1 >>> 16, h2 & 0xffff, h2 >>> 16);
};

export type RouteOverride = ConditionOverride | ChoiceOverride;

export interface RouteStep {
  seq: string;
  address: ProgramAddress;
  decision: number;
  checkpoint?: number;
  spentSteps?: number;
  spentNodes?: number;
}

export interface RouteCharge {
  steps: number;
  nodes: number;
  levelZero?: LevelZeroBound;
}

export interface RouteResumePoint {
  state: SearchState;
  steps: RouteStep[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  charge?: RouteCharge;
}

export const routeChargeAt = (
  route: RoutePlan,
  at: number,
): RouteCharge | null => {
  const step = route.steps[at];
  if (
    step?.spentSteps == null ||
    step.spentNodes == null
  ) {
    return null;
  }
  const levelZero =
    route.levelZero && route.levelZero.startSteps < step.spentSteps
      ? route.levelZero
      : undefined;
  return {
    steps: step.spentSteps,
    nodes: step.spentNodes,
    ...(levelZero ? { levelZero } : {}),
  };
};

export interface ConditionOverride {
  kind: "condition";
  site: ProgramAddress;
  value: boolean;
  departs?: true;
  open?: true;
}

export const firstPinMet = (
  route: RoutePlan,
  pinned: PinnedOptions,
): number => {
  if (pinned.offers.size === 0) {
    return -1;
  }
  const offers = new Map<string, number>();
  let menus = 0;
  for (let i = 0; i < route.decisions.length; i += 1) {
    const decision = route.decisions[i]!;
    if (decision.kind === "choice") {
      const sources = route.choices[menus]?.sources ?? [decision.value];
      menus += 1;
      if (pinnedAtMenu(pinned, sources, offers).length > 0) {
        return i;
      }
      for (const source of sources) {
        offers.set(source, (offers.get(source) ?? 0) + 1);
      }
    } else if (
      pinned.sites.has(decision.site) &&
      pinsNextOffer(
        pinned,
        String(decision.site),
        offers.get(String(decision.site)) ?? 0,
      )
    ) {
      return i;
    }
  }
  return -1;
};

const stepsBefore = (
  route: RoutePlan,
  pinned: PinnedOptions,
  decides: (decision: RouteOverride) => boolean,
): number => {
  const decided = route.decisions.findIndex(decides);
  const met = firstPinMet(route, pinned);
  return stepsBeforeDecision(
    route,
    decided < 0 ? met : met < 0 ? decided : Math.min(decided, met),
  );
};

export const stepsBeforeDeparture = (
  route: RoutePlan,
  pinned: PinnedOptions = NO_PINS,
): number =>
  stepsBefore(route, pinned, (d) => d.kind === "condition" && d.departs === true);

export const stepsBeforePinMet = (
  route: RoutePlan,
  pinned: PinnedOptions,
): number => stepsBeforeDecision(route, firstPinMet(route, pinned));

export const stepsBeforeTargetDecision = (
  route: RoutePlan,
  pinned: PinnedOptions = NO_PINS,
): number => {
  let menus = 0;
  return stepsBefore(route, pinned, (d) =>
    d.kind === "choice"
      ? (route.choices[menus++]?.options.length ?? 2) > 1
      : d.departs === true || d.open === true,
  );
};

const stepsBeforeDecision = (route: RoutePlan, first: number): number => {
  if (first < 0) {
    return route.steps.length;
  }
  let lo = 0;
  let hi = route.steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.steps[mid]!.decision >= first) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

export interface ChoiceOverride {
  kind: "choice";
  site: ProgramAddress;
  value: string;
}

export interface SearchOptions {
  searchStrategy?: "bfs" | "dfs";

  maxSteps?: number;

  maxNodes?: number;

  searchTimeout?: number;

  stayWithinKnot?: boolean;

  functions?: string[];

  pins?: PinnedOptions;

  callerResetsStory?: boolean;

  resumeFrom?: RouteResumePoint;

  stateImages?: boolean;

  levelZeroStore?: LevelZeroStore;
}

export interface LevelZeroStore {
  find(key: string): LevelZeroWork | undefined;
  keep(work: LevelZeroWork): void;
}

export interface LevelZeroWork {
  readonly key: string;
  readonly from: string;
  readonly chunks: ReadonlySet<number>;
  readonly moves: ReadonlyMap<number, ReadonlySet<number>>;
  readonly first: number | null;
  readonly ends: ReadonlySet<number>;
  readonly pins: string;
  readonly queue: readonly (SearchNode | (() => SearchNode | null))[];
  readonly departures: Tiers;
  readonly tierBound: TierBound | null;
  readonly pinsMet: readonly string[];
  readonly cut: SearchCutReason | null;
  readonly stepsRemaining: number;
  readonly nodesRemaining: number;
  readonly spentSteps: number;
  readonly faithfulEnd: number | null;
  readonly msRemaining: number;
  readonly visited: ReadonlySet<string>;
  readonly levelZero: LevelZeroBound | null;
  readonly nodesExpanded: number;
  readonly forkSitesSkipped: number;
  readonly errors: readonly SearchError[];
  readonly nodeErrored: boolean;
}

interface LevelZeroTrace {
  chunks: Set<number>;
  moves: Map<number, Set<number>>;
  first: number | null;
  ends: Set<number>;
  last: number;
}

const levelZeroKey = (
  from: string,
  options: SearchOptions | undefined,
  maxSteps: number,
  maxNodes: number,
): string =>
  JSON.stringify([
    from,
    options?.stayWithinKnot !== false,
    options?.functions ?? [],
    options?.stateImages !== false,
    maxSteps,
    maxNodes,
    faithfulBudget.steps,
    LEVEL_SHARE,
    options?.pins?.key ?? "",
    PIN_SHARE,
  ]);

const traceStep = (trace: LevelZeroTrace, address: ProgramAddress) => {
  const chunk = chunkOfAddress(address);
  if (chunk === trace.last) {
    return;
  }
  if (trace.last >= 0) {
    let to = trace.moves.get(trace.last);
    if (!to) {
      to = new Set();
      trace.moves.set(trace.last, to);
    }
    to.add(chunk);
  } else {
    trace.first ??= chunk;
  }
  trace.chunks.add(chunk);
  trace.last = chunk;
};

interface StoryPositions {
  previous(): ProgramAddress | undefined;
  knot(): string;
  stackHolds(knot: string): boolean;
  errorAddress(
    raised: { path?: string | null; address?: number } | null | undefined,
  ): ProgramAddress | null;
}

const chunkScenes = new WeakMap<ProgramRoot, Map<number, string>>();

const sceneOfAddress = (root: ProgramRoot, address: number): string => {
  if (address < 0) {
    return "0";
  }
  let scenes = chunkScenes.get(root);
  if (!scenes) {
    scenes = new Map();
    chunkScenes.set(root, scenes);
  }
  const id = chunkOfAddress(address);
  let scene = scenes.get(id);
  if (scene === undefined) {
    scene = root.sceneAt(address) ?? "0";
    scenes.set(id, scene);
  }
  return scene;
};

const storyPositions = (story: Story): StoryPositions => {
  let lastSequence: SequenceRow | null = null;
  let lastScene = "0";
  return {
    previous: () => {
      const address = story.previousAddress;
      return address >= 0 ? address : (story.endedAt ?? undefined);
    },
    knot: () => {
      const sequence = story.state.position?.sequence ?? null;
      if (!sequence) {
        return "0";
      }
      if (sequence !== lastSequence) {
        lastSequence = sequence;
        lastScene = story.root.sceneOf(sequence) ?? "0";
      }
      return lastScene;
    },
    stackHolds: (knot) =>
      story
        .stackAddresses()
        .some((address) => sceneOfAddress(story.root, address) === knot),
    errorAddress: (raised) => {
      if (raised?.address !== undefined) {
        return raised.address;
      }
      const address = story.previousAddress;
      return address >= 0 ? address : null;
    },
  };
};

interface StatePort {
  fork(): { state: SearchState; key: string };
  restore(state: SearchState): void;
}

const statePort = (story: Story, images: boolean): StatePort => {
  if (images) {
    const program = story;
    return {
      fork: () => {
        const image = program.capture();
        return { state: image, key: imageDigest(image) };
      },
      restore: (state) => {
        if (typeof state === "string") {
          story.state.LoadJson(state);
        } else if (!program.restore(state)) {
          throw new Error("A search node's image names a position the program does not hold.");
        }
      },
    };
  }
  return {
    fork: () => {
      const json = story.state.toJson();
      return { state: json, key: extendSeq("", json) };
    },
    restore: (state) => story.state.LoadJson(state as string),
  };
};

export interface RunResult {
  hitTarget: boolean;
  steps: RouteStep[];
  branches: SearchNode[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  terminal: boolean;
  metPins?: readonly string[];
}

export const DEFAULT_MAX_STEPS = 2_000_000;

export const DEFAULT_MAX_NODES = 100_000;

export const DEFAULT_SEARCH_TIMEOUT = 30_000;

export type SearchCutReason = "max-steps" | "max-nodes" | "timeout";

export type SearchEndReason =
  | "found"
  | SearchCutReason
  | "errored"
  | "exhausted";

interface SearchBudget {
  stepsRemaining: number;
  nodesRemaining: number;
  maxSteps: number;
  maxNodes: number;
  deadlineTime: number;
  cut: SearchCutReason | null;
  visited: Set<string>;
  faithfulEnd: number | null;
  trace?: LevelZeroTrace;
}

const stepBudgetExhausted = (budget: SearchBudget): boolean => {
  if (
    budget.stepsRemaining <= 0 ||
    (budget.faithfulEnd !== null && spentSteps(budget) >= budget.faithfulEnd)
  ) {
    budget.cut ??= "max-steps";
    return true;
  }
  if (now() >= budget.deadlineTime) {
    budget.cut ??= "timeout";
    return true;
  }
  return false;
};

const spentSteps = (budget: SearchBudget): number =>
  budget.maxSteps - budget.stepsRemaining;

const spentNodes = (budget: SearchBudget): number =>
  budget.maxNodes - budget.nodesRemaining;

type QueueEntry = SearchNode | (() => SearchNode | null);

interface NotTaken {
  site: ProgramAddress;
  route: number;
  node: () => SearchNode;
}

const notTakenKey = (notTaken: NotTaken): string =>
  `${notTaken.route}|${notTaken.site}`;

interface Level {
  index: number;
  bound: { startSteps: number; steps: number; nodes: number } | null;
  notTaken: Map<string, NotTaken>;
  cutAt: SearchNode | null;
  spent: boolean;
}

const newLevel = (index: number): Level => ({
  index,
  bound: null,
  notTaken: new Map(),
  cutAt: null,
  spent: false,
});

type Tiers = Map<number, Map<number, QueueEntry[]>>;

interface TierBound {
  steps: number;
  nodes: number;
}

const addDeparture = (
  tiers: Tiers,
  left: number,
  forced: number,
  entry: QueueEntry,
): void => {
  let tier = tiers.get(left);
  if (!tier) {
    tier = new Map();
    tiers.set(left, tier);
  }
  let queue = tier.get(forced);
  if (!queue) {
    queue = [];
    tier.set(forced, queue);
  }
  queue.push(entry);
};

const copyTiers = (tiers: Tiers): Tiers =>
  new Map(
    [...tiers].map(([left, tier]) => [
      left,
      new Map([...tier].map(([forced, queue]) => [forced, [...queue]])),
    ]),
  );

const takeDepartures = (
  tiers: Tiers,
  left: number,
  forced: number,
): QueueEntry[] => {
  const tier = tiers.get(left);
  const queue = tier?.get(forced) ?? [];
  tier?.delete(forced);
  return queue;
};

const fewestForced = (tiers: Tiers, left: number): number | undefined => {
  let fewest: number | undefined;
  for (const forced of tiers.get(left)?.keys() ?? []) {
    if (fewest === undefined || forced < fewest) {
      fewest = forced;
    }
  }
  return fewest;
};

const bindTier = (budget: SearchBudget): TierBound => {
  const steps =
    budget.faithfulEnd === null
      ? Math.min(budget.stepsRemaining, faithfulBudget.steps)
      : Math.min(
          budget.stepsRemaining,
          Math.max(0, budget.faithfulEnd - spentSteps(budget)),
        );
  return {
    steps: spentSteps(budget) + Math.max(1, Math.floor(steps * PIN_SHARE)),
    nodes:
      spentNodes(budget) +
      Math.max(1, Math.floor(budget.nodesRemaining * PIN_SHARE)),
  };
};

const tierSpent = (bound: TierBound | null, budget: SearchBudget): boolean =>
  bound !== null &&
  (spentSteps(budget) >= bound.steps || spentNodes(budget) >= bound.nodes);

const bindLevel = (level: Level, budget: SearchBudget): void => {
  const stepsRemaining =
    budget.faithfulEnd === null
      ? budget.stepsRemaining
      : Math.min(
          budget.stepsRemaining,
          Math.max(0, budget.faithfulEnd - spentSteps(budget)),
        );
  level.bound ??= {
    startSteps: spentSteps(budget),
    steps:
      spentSteps(budget) +
      Math.max(1, Math.floor(stepsRemaining * LEVEL_SHARE)),
    nodes:
      spentNodes(budget) +
      Math.max(1, Math.floor(budget.nodesRemaining * LEVEL_SHARE)),
  };
};

const bindLevelZero = (level: Level, budget: SearchBudget): void => {
  if (level.bound) {
    return;
  }
  if (budget.faithfulEnd == null) {
    startFaithfulBudget(budget, spentSteps(budget));
  }
  bindLevel(level, budget);
  const bound = level.bound!;
  const faithfulEnd = budget.faithfulEnd!;
  if (faithfulEnd <= spentSteps(budget) + budget.stepsRemaining) {
    bound.steps = Math.max(bound.steps, faithfulEnd);
  }
};

const nextLevelQueue = (
  level: Level,
  unexpanded: QueueEntry[],
): QueueEntry[] => [
  ...[...level.notTaken.values()].reverse().map((notTaken) => notTaken.node),
  ...unexpanded,
  ...(level.cutAt ? [level.cutAt] : []),
];

const levelSpent = (level: Level, budget: SearchBudget): boolean => {
  if (
    level.bound &&
    (spentSteps(budget) >= level.bound.steps ||
      spentNodes(budget) >= level.bound.nodes)
  ) {
    level.spent = true;
    return true;
  }
  return false;
};

const searchBudgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.nodesRemaining <= 0) {
    budget.cut ??= "max-nodes";
    return true;
  }
  return stepBudgetExhausted(budget);
};

const claimForkSite = (
  budget: SearchBudget,
  site: ProgramAddress,
  stateKey: string,
): boolean => {
  const key = `${site}|${stateKey}`;
  if (budget.visited.has(key)) {
    lastSearchStats.forkSitesSkipped += 1;
    return false;
  }
  budget.visited.add(key);
  return true;
};

export const lastSearchStats: {
  nodesExpanded: number;
  stepsUsed: number;
  forkSitesSkipped: number;
  exhaustedBudget: boolean;
  endReason: SearchEndReason;
  errors: SearchError[];
} = {
  nodesExpanded: 0,
  stepsUsed: 0,
  forkSitesSkipped: 0,
  exhaustedBudget: false,
  endReason: "exhausted",
  errors: [],
};

export interface SearchError {
  message: string;
  address: ProgramAddress | null;
}

const startFaithfulBudget = (budget: SearchBudget, startSteps: number) => {
  budget.faithfulEnd = startSteps + faithfulBudget.steps;
  budget.deadlineTime = Math.min(
    budget.deadlineTime,
    now() + faithfulBudget.timeoutMs,
  );
};

const planRouteFaithful = (
  story: Story,
  from: string,
  to: ProgramAddress,
  options?: SearchOptions,
): RoutePlan | null => {
  lastSearchStats.nodesExpanded = 0;
  lastSearchStats.stepsUsed = 0;
  lastSearchStats.forkSitesSkipped = 0;
  lastSearchStats.exhaustedBudget = false;
  lastSearchStats.endReason = "exhausted";
  lastSearchStats.errors = [];

  const isBfs = (options?.searchStrategy ?? "bfs") === "bfs";
  const startTime = now();
  const searchTimeout = options?.searchTimeout ?? DEFAULT_SEARCH_TIMEOUT;
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxNodes = Math.min(
    options?.maxNodes ?? DEFAULT_MAX_NODES,
    faithfulBudget.nodes,
  );
  const charge = options?.resumeFrom?.charge;
  const prefixSteps = charge ? Math.max(0, charge.steps - 1) : 0;
  const prefixNodes = charge ? Math.max(0, charge.nodes - 1) : 0;
  const budget: SearchBudget = {
    stepsRemaining: maxSteps - prefixSteps,
    nodesRemaining: maxNodes - prefixNodes,
    maxSteps,
    maxNodes,
    deadlineTime: startTime + searchTimeout,
    cut: null,
    visited: new Set(),
    faithfulEnd: null,
  };
  if (charge?.levelZero) {
    startFaithfulBudget(budget, charge.levelZero.startSteps);
  }
  const pinned = options?.pins ?? NO_PINS;
  const fromKnotName = from.split(".")[0] || "0";
  const positions = storyPositions(story);

  const store =
    options?.resumeFrom || !isBfs ? undefined : options?.levelZeroStore;
  const key = store ? levelZeroKey(from, options, maxSteps, maxNodes) : "";
  const kept = store?.find(key);
  const reuse =
    kept && !kept.chunks.has(chunkOfAddress(to)) ? kept : undefined;
  if (store && !reuse) {
    budget.trace = {
      chunks: new Set(),
      moves: new Map(),
      first: null,
      ends: new Set(),
      last: -1,
    };
  }

  let routePlan: RoutePlan | null = null;
  let nodeErrored = reuse?.nodeErrored ?? false;
  const startingSteps = budget.stepsRemaining;

  const port = statePort(story, options?.stateImages !== false);
  const prevOnError = story.onError;
  const prevOnExecute = story.onExecute;
  const prevOnMakeChoice = story.onMakeChoice;
  const prevOnEvaluateCondition = story.onEvaluateCondition;
  const beatImages = story as unknown as { keepBeatImages?: boolean };
  const prevKeepBeatImages = beatImages.keepBeatImages;
  if (prevKeepBeatImages !== undefined) {
    beatImages.keepBeatImages = false;
  }

  try {
    const start = reuse
      ? null
      : options?.resumeFrom
        ? makeResumeNode(options.resumeFrom)
        : makeStartNode(story, from, port);

    const raisedErrors = new Set<string>(
      reuse?.errors.map((e) => `${e.address} ${e.message}`),
    );
    story.onError = (message, type, _source, raised) => {
      if (type !== ErrorType.Error) {
        return;
      }
      const error: SearchError = {
        message: raised?.message ?? message,
        address: positions.errorAddress(raised),
      };
      const key = `${error.address} ${error.message}`;
      if (!raisedErrors.has(key)) {
        raisedErrors.add(key);
        lastSearchStats.errors.push(error);
      }
    };
    story.onExecute = null;
    story.onMakeChoice = NOOP;
    story.onEvaluateCondition = NOOP;

    let level = newLevel(0);
    if (charge?.levelZero) {
      level.bound = { ...charge.levelZero };
    }
    const levelZero = level;
    let queue: (QueueEntry | undefined)[] = start ? [start] : [];
    let head = 0;
    let tier = 0;
    let tiers: Tiers = new Map();
    let tierBound: TierBound | null = null;
    let tierCut = false;
    const pinsMet = new Set<string>(reuse?.pinsMet);
    const meetPin = (key: string) => {
      if (tier === 0) {
        pinsMet.add(key);
      }
    };
    let held: { plan: RoutePlan; forced: number } | null = null;
    const depart = (left: number, forced: number, entry: QueueEntry) => {
      tierBound ??= bindTier(budget);
      addDeparture(tiers, left, forced, entry);
    };
    let stopped = false;
    if (reuse) {
      budget.stepsRemaining = reuse.stepsRemaining;
      budget.nodesRemaining = reuse.nodesRemaining;
      budget.faithfulEnd = reuse.faithfulEnd;
      budget.deadlineTime = now() + reuse.msRemaining;
      budget.visited = new Set(reuse.visited);
      budget.cut = reuse.cut;
      levelZero.bound = reuse.levelZero && { ...reuse.levelZero };
      lastSearchStats.nodesExpanded = reuse.nodesExpanded;
      lastSearchStats.forkSitesSkipped = reuse.forkSitesSkipped;
      lastSearchStats.errors = [...reuse.errors];
      tiers = copyTiers(reuse.departures);
      tierBound = reuse.tierBound && { ...reuse.tierBound };
      stopped = reuse.cut !== null;
      if (!stopped) {
        level = newLevel(1);
        bindLevel(level, budget);
        queue = [...reuse.queue];
      }
    }
    const joining = new Map<string, { visit: number; notTaken: NotTaken }>();
    let visits = 0;
    const defer = (forced: number, notTaken: NotTaken) => {
      const key = notTakenKey(notTaken);
      if (forced > level.index) {
        level.notTaken.delete(key);
        level.notTaken.set(key, notTaken);
        return;
      }
      const visit = ++visits;
      joining.set(key, { visit, notTaken });
      queue.push(() => {
        const latest = joining.get(key);
        return latest?.visit === visit ? latest.notTaken.node() : null;
      });
    };
    while (!stopped) {
      while (head < queue.length) {
        if (
          searchBudgetExhausted(budget) ||
          levelSpent(level, budget) ||
          tierSpent(tierBound, budget)
        ) {
          break;
        }

        let entry: QueueEntry | undefined;
        if (isBfs) {
          entry = queue[head];
          queue[head] = undefined;
          head += 1;
        } else {
          entry = queue.pop();
        }
        const node = typeof entry === "function" ? entry() : entry;
        if (!node) {
          continue;
        }
        budget.nodesRemaining -= 1;
        lastSearchStats.nodesExpanded += 1;
        try {
          const result = runUntilDecisionOrBranch(
            story,
            port,
            node,
            positions,
            fromKnotName,
            to,
            options?.stayWithinKnot !== false,
            options?.functions || [],
            budget,
            level,
            defer,
            pinned,
            depart,
            () => tierBound,
            meetPin,
          );

          if (result.hitTarget) {
            const found: RoutePlan = {
              from,
              to,
              steps: result.steps,
              decisions: result.decisions,
              conditions: result.conditions,
              choices: result.choices,
              ...(levelZero.bound ? { levelZero: { ...levelZero.bound } } : {}),
            };
            const met = result.metPins ?? [];
            if (tier === 0 && [...pinsMet].some((key) => !met.includes(key))) {
              held ??= { plan: found, forced: node.forced };
              continue;
            }
            routePlan =
              held && tier > 0 && held.forced <= node.forced
                ? held.plan
                : found;
            break;
          }

          for (const b of result.branches) {
            queue.push(b);
          }
        } catch {
          nodeErrored = true;
        }
      }
      if (routePlan) {
        break;
      }
      if (charge && level === levelZero && level.spent) {
        break;
      }
      const spentTier = tierSpent(tierBound, budget);
      const next =
        budget.cut || spentTier
          ? []
          : nextLevelQueue(
              level,
              queue.slice(head).filter((n): n is QueueEntry => !!n),
            );
      if (store && budget.trace && level === levelZero && !held) {
        const trace = budget.trace;
        budget.trace = undefined;
        store.keep({
          key,
          from,
          chunks: trace.chunks,
          moves: trace.moves,
          first: trace.first,
          ends: trace.ends,
          pins: pinned.key,
          queue: [...next],
          departures: copyTiers(tiers),
          tierBound: tierBound && { ...tierBound },
          pinsMet: [...pinsMet],
          cut: budget.cut,
          stepsRemaining: budget.stepsRemaining,
          nodesRemaining: budget.nodesRemaining,
          spentSteps: spentSteps(budget),
          faithfulEnd: budget.faithfulEnd,
          msRemaining: budget.deadlineTime - now(),
          visited: new Set(budget.visited),
          levelZero: levelZero.bound && { ...levelZero.bound },
          nodesExpanded: lastSearchStats.nodesExpanded,
          forkSitesSkipped: lastSearchStats.forkSitesSkipped,
          errors: [...lastSearchStats.errors],
          nodeErrored,
        });
      }
      if (budget.cut) {
        break;
      }
      let index = level.index + 1;
      let queued = spentTier
        ? []
        : [...next, ...takeDepartures(tiers, tier, index)];
      const fewest = spentTier ? undefined : fewestForced(tiers, tier);
      if (!queued.length && fewest !== undefined) {
        index = fewest;
        queued = takeDepartures(tiers, tier, fewest);
      }
      if (!queued.length) {
        tierCut ||= spentTier;
        tiers.delete(tier);
        tier += 1;
        tierBound = null;
        const first = fewestForced(tiers, tier);
        if (first === undefined) {
          break;
        }
        index = first;
        queued = takeDepartures(tiers, tier, first);
      }
      if (held && tier > 0 && index >= held.forced) {
        break;
      }
      level = newLevel(index);
      if (index > 0) {
        bindLevel(level, budget);
      }
      queue = queued;
      head = 0;
    }
    routePlan ??= held?.plan ?? null;

    lastSearchStats.stepsUsed = startingSteps - budget.stepsRemaining;
    lastSearchStats.exhaustedBudget = budget.cut !== null || tierCut;
    lastSearchStats.endReason = routePlan
      ? "found"
      : (budget.cut ??
        (tierCut ? "max-steps" : nodeErrored ? "errored" : "exhausted"));
  } finally {
    try {
      if (!routePlan || !options?.callerResetsStory) {
        resetStory(story);
      } else {
        story.CancelAsyncContinue();
      }
    } finally {
      story.onError = prevOnError;
      story.onExecute = prevOnExecute;
      story.onMakeChoice = prevOnMakeChoice;
      story.onEvaluateCondition = prevOnEvaluateCondition;
      if (prevKeepBeatImages !== undefined) {
        beatImages.keepBeatImages = prevKeepBeatImages;
      }
    }
  }

  return routePlan;
};

export const planRoute = (
  story: Story,
  from: string,
  to: ProgramAddress,
  options?: SearchOptions,
): RoutePlan | null => {
  const route = searchRoute(story, from, to, options);
  const pins = options?.pins?.key;
  return route && pins ? { ...route, pins } : route;
};

const searchRoute = (
  story: Story,
  from: string,
  to: ProgramAddress,
  options?: SearchOptions,
): RoutePlan | null => {
  if (options?.resumeFrom && !options.resumeFrom.charge) {
    const route = planRouteFallback(story, from, to, options);
    return route ? { ...route, fallback: true } : null;
  }
  const faithful = planRouteFaithful(story, from, to, options);
  if (faithful || options?.resumeFrom) {
    return faithful;
  }
  const route = planRouteFallback(story, from, to, options);
  return route ? { ...route, fallback: true } : null;
};

const runUntilDecisionOrBranch = (
  story: Story,
  port: StatePort,
  node: SearchNode,
  positions: StoryPositions,
  fromKnotName: string,
  target: ProgramAddress | null,
  stayWithinKnot: boolean,
  functions: string[],
  budget: SearchBudget,
  level: Level,
  defer: (forced: number, notTaken: NotTaken) => void,
  pinned: PinnedOptions,
  depart: (left: number, forced: number, entry: QueueEntry) => void,
  tierBound: () => TierBound | null,
  meetPin: (key: string) => void,
): RunResult => {
  port.restore(node.state);
  story.state.ResetErrors();
  story.endedAt = null;

  const prevPauseBeforeEvaluatingConditions =
    story.pauseBeforeEvaluatingConditions;
  const prevSimulator = story.simulator;

  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  const runDecisions: RouteOverride[] = [];
  const runConditions: { selected: boolean }[] = [];
  const decisionCount = () => trailLength(node.decisions) + runDecisions.length;

  const branches: SearchNode[] = [];
  let hitTarget = false;
  let terminal = false;

  let seq = node.seq;
  const stepsEncountered: RouteStep[] = [];

  const charge = (steps: number) => {
    budget.stepsRemaining -= steps;
  };

  type Mark = {
    steps: number;
    decisions: number;
    conditions: number;
  };
  const mark = (): Mark => ({
    steps: stepsEncountered.length,
    decisions: runDecisions.length,
    conditions: runConditions.length,
  });

  let metPins = node.metPins;

  const nodeAt = (
    state: SearchState,
    at: Mark,
    overrides: RouteOverride[],
    add?: RouteOverride,
    choice?: RouteChoice,
    left = node.left,
    met = metPins,
  ): SearchNode => {
    let decisions = extendTrail(node.decisions, runDecisions, at.decisions);
    let conditions = extendTrail(node.conditions, runConditions, at.conditions);
    let choices = node.choices;
    if (add) {
      decisions = extendTrail(decisions, [add]);
      if (add.kind === "condition") {
        conditions = extendTrail(conditions, [{ selected: add.value }]);
      }
    }
    if (choice) {
      choices = extendTrail(choices, [choice]);
    }
    return {
      state,
      seq: stepsEncountered[at.steps - 1]?.seq ?? node.seq,
      steps: extendTrail(node.steps, stepsEncountered, at.steps),
      decisions,
      conditions,
      choices,
      overrides,
      forced: node.forced + (add?.kind === "condition" && add.departs ? 1 : 0),
      left,
      metPins: met,
      route: add ? newRoute() : node.route,
    };
  };
  let pending = node.overrides;
  let putBack: RouteStep | undefined;
  if (budget.trace) {
    budget.trace.last = -1;
  }
  const turnEnd =
    (Math.floor(spentSteps(budget) / RUN_TURN_STEPS) + 1) * RUN_TURN_STEPS;
  let lastFork = { state: node.state, at: mark(), overrides: node.overrides };

  try {
    while (true) {
      if (stepBudgetExhausted(budget)) {
        terminal = true;
        break;
      }
      if (levelSpent(level, budget)) {
        level.cutAt = nodeAt(port.fork().state, mark(), pending);
        terminal = true;
        break;
      }
      if (tierSpent(tierBound(), budget)) {
        terminal = true;
        break;
      }
      if (spentSteps(budget) >= turnEnd) {
        branches.push(nodeAt(port.fork().state, mark(), pending));
        terminal = true;
        break;
      }
      charge(1);

      const previous = positions.previous();

      if (previous !== undefined) {
        if (budget.trace) {
          traceStep(budget.trace, previous);
        }
        if (
          stepsEncountered.length === 0 ||
          previous !== stepsEncountered.at(-1)?.address
        ) {
          seq = extendSeq(seq, previous);
          const again = putBack?.address === previous ? putBack : undefined;
          stepsEncountered.push(
            level.index === 0
              ? {
                  decision: decisionCount() - 1,
                  address: previous,
                  seq,
                  spentSteps: again?.spentSteps ?? spentSteps(budget),
                  spentNodes: again?.spentNodes ?? spentNodes(budget),
                }
              : { decision: decisionCount() - 1, address: previous, seq },
          );
        }
        putBack = undefined;
      }

      if (previous !== undefined && previous === target) {
        hitTarget = true;
        terminal = true;
        break;
      }

      if (!story.canContinue && story.currentChoices.length > 0) {
        const site = previous ?? TOP_LEVEL_START;
        if (simulator.willForceChoice(site)) {
          const forcedSourcePath = simulator?.forceChoice(site);
          const forced = story.currentChoices.find(
            (choice) => choice.sourcePath === forcedSourcePath,
          );
          if (forced) {
            story.ChooseChoice(forced);
          }
        } else {
          stepsEncountered.pop();
          const fork = port.fork();
          const forkState = fork.state;
          if (!claimForkSite(budget, site, fork.key)) {
            terminal = true;
            break;
          }
          const options = story.currentChoices.map((c) => c.text);
          const sources = story.currentChoices.map((c) => c.sourcePath);
          const at = mark();
          const forkChoice = (
            selected: number,
            left = node.left,
            met = metPins,
          ) => {
            const ov: ChoiceOverride = {
              kind: "choice",
              site,
              value: sources[selected]!,
            };
            return nodeAt(
              forkState,
              at,
              [ov],
              ov,
              { options, selected, sources },
              left,
              met,
            );
          };
          const counts =
            pinned.offers.size > 0
              ? pinnedOfferCounts(flattenTrail(node.choices), pinned)
              : null;
          const pinnedHere = counts
            ? pinnedAtMenu(pinned, sources, counts)
            : [];
          if (pinnedHere.length > 0) {
            const taken = pinnedHere[0]!;
            const source = sources[taken]!;
            const meeting = pinnedOfferKey(source, (counts!.get(source) ?? 0) + 1);
            meetPin(meeting);
            const met = [...metPins, meeting];
            branches.push(forkChoice(taken, node.left, met));
            for (let i = 0; i < sources.length; i++) {
              if (i !== taken) {
                depart(node.left + 1, node.forced, () =>
                  forkChoice(i, node.left + 1, met),
                );
              }
            }
            terminal = true;
            break;
          }
          for (let i = 0; i < story.currentChoices.length; i++) {
            branches.push(forkChoice(i));
          }
          break;
        }
      }

      if (!story.canContinue) {
        if (budget.trace && budget.trace.last >= 0) {
          budget.trace.ends.add(budget.trace.last);
        }
        terminal = true;
        break;
      }

      if (stayWithinKnot && exitedKnot(story, positions, fromKnotName, functions)) {
        terminal = true;
        break;
      }

      story.pauseBeforeEvaluatingConditions = true;

      const stepsBefore = story.stepCount;
      let allowed = level.bound
        ? Math.max(0, level.bound.steps - spentSteps(budget))
        : budget.stepsRemaining;
      if (budget.faithfulEnd !== null) {
        allowed = Math.min(
          allowed,
          Math.max(0, budget.faithfulEnd - spentSteps(budget)),
        );
      }
      const tier = tierBound();
      if (tier) {
        allowed = Math.min(allowed, Math.max(0, tier.steps - spentSteps(budget)));
      }
      story.stepLimit = stepsBefore + 1 + allowed;
      let stopped = false;
      try {
        story.ContinueAsync();
      } catch (e) {
        if (!(e instanceof StepLimitExceeded)) {
          throw e;
        }
        stopped = true;
      } finally {
        story.stepLimit = null;
        charge(Math.max(0, story.stepCount - stepsBefore - 1));
      }
      if (stopped) {
        if (stepBudgetExhausted(budget)) {
        } else if (levelSpent(level, budget)) {
          level.cutAt = nodeAt(lastFork.state, lastFork.at, lastFork.overrides);
        }
        terminal = true;
        break;
      }
      pending = [];

      if (story.pausedBeforeCondition !== null) {
        const site = story.pausedBeforeCondition;
        const natural = story.pausedConditionValue;
        putBack = stepsEncountered.pop();
        seq = stepsEncountered.at(-1)?.seq ?? node.seq;

        const fork = port.fork();
        if (!claimForkSite(budget, site, fork.key)) {
          terminal = true;
          break;
        }

        let gate: string | null = null;
        if (pinned.sites.has(site)) {
          const counts = pinnedOfferCounts(flattenTrail(node.choices), pinned);
          const count = counts.get(String(site)) ?? 0;
          if (
            pinsNextOffer(pinned, String(site), count) &&
            gateWinsMenu(
              pinned,
              story.state.generatedChoices.map((c) => c.sourcePath),
              counts,
            )
          ) {
            gate = pinnedOfferKey(String(site), count + 1);
            meetPin(gate);
          }
        }
        const gateMet = gate ? [...metPins, gate] : metPins;
        if (gate && natural !== true) {
          if (level.index === 0) {
            bindLevelZero(level, budget);
          }
          const at = mark();
          const keep: ConditionOverride =
            natural === false
              ? { kind: "condition", site, value: true, departs: true }
              : { kind: "condition", site, value: true };
          if (natural === false) {
            defer(node.forced + 1, {
              site,
              route: node.route,
              node: () =>
                nodeAt(
                  fork.state,
                  at,
                  [keep],
                  keep,
                  undefined,
                  node.left,
                  gateMet,
                ),
            });
          } else {
            branches.push(
              nodeAt(fork.state, at, [keep], keep, undefined, node.left, gateMet),
            );
          }
          const leave: ConditionOverride = {
            kind: "condition",
            site,
            value: false,
          };
          depart(node.left + 1, node.forced, () =>
            nodeAt(
              fork.state,
              at,
              [leave],
              leave,
              undefined,
              node.left + 1,
              gateMet,
            ),
          );
          terminal = true;
          break;
        }

        if (natural !== null) {
          if (level.index === 0) {
            bindLevelZero(level, budget);
          }
          const at = mark();
          const other: ConditionOverride = {
            kind: "condition",
            site,
            value: !natural,
            departs: true,
          };
          if (gate) {
            depart(node.left + 1, node.forced + 1, () =>
              nodeAt(
                fork.state,
                at,
                [other],
                other,
                undefined,
                node.left + 1,
                gateMet,
              ),
            );
            metPins = gateMet;
          } else {
            const met = metPins;
            defer(node.forced + 1, {
              site,
              route: node.route,
              node: () =>
                nodeAt(fork.state, at, [other], other, undefined, node.left, met),
            });
          }
          const ov: ConditionOverride = {
            kind: "condition",
            site,
            value: natural,
          };
          runDecisions.push(ov);
          runConditions.push({ selected: natural });
          simulator.add(ov);
          pending = [ov];
          lastFork = { state: fork.state, at: mark(), overrides: pending };
          continue;
        }

        const at = mark();
        for (const value of [true, false]) {
          const ov: ConditionOverride = { kind: "condition", site, value, open: true };
          branches.push(nodeAt(fork.state, at, [ov], ov));
        }
        break;
      }
    }
  } finally {
    story.pauseBeforeEvaluatingConditions = prevPauseBeforeEvaluatingConditions;
    story.simulator = prevSimulator;
  }

  const route = (all: Mark) => ({
    steps: flattenTrail(extendTrail(node.steps, stepsEncountered, all.steps)),
    decisions: flattenTrail(
      extendTrail(node.decisions, runDecisions, all.decisions),
    ),
    conditions: flattenTrail(
      extendTrail(node.conditions, runConditions, all.conditions),
    ),
    choices: flattenTrail(node.choices),
  });
  return {
    hitTarget,
    branches,
    ...(hitTarget
      ? route(mark())
      : { steps: [], decisions: [], conditions: [], choices: [] }),
    terminal,
    metPins,
  };
};

const resetStory = (story: Story) => {
  story.CancelAsyncContinue();
  story.ResetState();
};

const makeStartNode = (
  story: Story,
  from: string,
  port: StatePort,
): SearchNode => {
  if (!story.stateIsPristine) {
    resetStory(story);
  }
  story.ChoosePathString(from);
  return {
    state: port.fork().state,
    seq: "",
    steps: null,
    decisions: null,
    conditions: null,
    choices: null,
    overrides: [],
    forced: 0,
    left: 0,
    metPins: [],
    route: newRoute(),
  };
};

const makeResumeNode = (resumeFrom: RouteResumePoint): SearchNode => {
  return {
    state: resumeFrom.state,
    seq: resumeFrom.steps.at(-1)?.seq ?? "",
    steps: extendTrail(null, resumeFrom.steps),
    decisions: extendTrail(null, resumeFrom.decisions),
    conditions: extendTrail(null, resumeFrom.conditions),
    choices: extendTrail(null, resumeFrom.choices),
    overrides: [],
    forced: 0,
    left: 0,
    metPins: [],
    route: newRoute(),
  };
};

const isRootLevel = (knot: string): boolean =>
  knot === "0" || /^\d+$/.test(knot);

const exitedKnot = (
  _story: Story,
  positions: StoryPositions,
  knotName: string,
  functions: string[],
): boolean => {
  const curKnot = positions.knot();

  if (curKnot === knotName) {
    return false;
  }

  if (isRootLevel(curKnot)) {
    return false;
  }

  if (functions.includes(curKnot)) {
    return false;
  }

  return !positions.stackHolds(knotName);
};

export interface RouteSimulator extends Simulator {
  add(override: RouteOverride): void;
  decisionsTaken(): number;
}

export const buildRouteSimulator = (
  decisions: RouteOverride[],
  fromDecision = 0,
): RouteSimulator => {
  const condQueues = new Map<ProgramAddress, boolean[]>();
  const conditionPointers = new Map<ProgramAddress, number>();
  const choiceQueues = new Map<ProgramAddress, string[]>();
  const choicePointers = new Map<ProgramAddress, number>();

  const pending = fromDecision > 0 ? decisions.slice(fromDecision) : decisions;
  let decisionsTaken = Math.max(fromDecision, 0);

  const add = (s: RouteOverride) => {
    if (s.kind === "condition") {
      const q = condQueues.get(s.site) ?? [];
      q.push(s.value);
      condQueues.set(s.site, q);
    } else {
      const q = choiceQueues.get(s.site) ?? [];
      q.push(s.value);
      choiceQueues.set(s.site, q);
    }
  };

  for (const s of pending) {
    add(s);
  }

  const nextFrom = <T>(
    queues: Map<ProgramAddress, T[]>,
    pointers: Map<ProgramAddress, number>,
    key: ProgramAddress,
  ): T | null => {
    const q = queues.get(key);
    if (!q || q.length === 0) {
      return null;
    }
    const i = pointers.get(key) ?? 0;
    if (i >= q.length) {
      return null;
    }
    const v = q[i];
    pointers.set(key, i + 1);
    decisionsTaken += 1;
    return v ?? null;
  };

  const saveSnapshot = (): SimulatorSnapshot => ({
    conditionPointer: Object.fromEntries(conditionPointers),
    choicePointer: Object.fromEntries(choicePointers),
  });

  const willForceCondition = (site: ProgramAddress) => {
    const q = condQueues.get(site);
    if (!q) {
      return false;
    }
    const i = conditionPointers.get(site) ?? 0;
    return i < q.length;
  };

  const willForceChoice = (site: ProgramAddress) => {
    const q = choiceQueues.get(site);
    if (!q) {
      return false;
    }
    const i = choicePointers.get(site) ?? 0;
    return i < q.length;
  };

  return {
    forceCondition: (site: ProgramAddress): boolean | null =>
      nextFrom(condQueues, conditionPointers, site),
    forceChoice: (site: ProgramAddress): string | null =>
      nextFrom(choiceQueues, choicePointers, site),
    willForceCondition,
    willForceChoice,
    saveSnapshot,
    add,
    decisionsTaken: () => decisionsTaken,
  };
};

const now = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

const NOOP = () => {};

export const showsBeatAhead = (
  story: Story,
  maxSteps = DEFAULT_MAX_STEPS,
): boolean => {
  const prevOnError = story.onError;
  const prevOnExecute = story.onExecute;
  const prevOnMakeChoice = story.onMakeChoice;
  const prevOnEvaluateCondition = story.onEvaluateCondition;
  const beatImages = story as unknown as { keepBeatImages?: boolean };
  const prevKeepBeatImages = beatImages.keepBeatImages;
  if (prevKeepBeatImages !== undefined) {
    beatImages.keepBeatImages = false;
  }
  story.onError = NOOP;
  story.onExecute = null;
  story.onMakeChoice = NOOP;
  story.onEvaluateCondition = NOOP;
  story.stepLimit = story.stepCount + maxSteps;
  try {
    story.state.ResetErrors();
    while (story.canContinue) {
      story.Continue();
      if (story.hasError) {
        return false;
      }
      if (story.continueShowedSomething) {
        return true;
      }
    }
    return story.currentChoices.length > 0;
  } catch {
    return false;
  } finally {
    story.stepLimit = null;
    story.onError = prevOnError;
    story.onExecute = prevOnExecute;
    story.onMakeChoice = prevOnMakeChoice;
    story.onEvaluateCondition = prevOnEvaluateCondition;
    if (prevKeepBeatImages !== undefined) {
      beatImages.keepBeatImages = prevKeepBeatImages;
    }
  }
};
