import type { SimulatorSnapshot } from "../../runtime/Simulator";
import { ErrorType } from "../../runtime/Error";
import type { ProgramStory as Story } from "../../program/ProgramStory";
import { StepLimitExceeded } from "../../runtime/StoryException";
import { imageDigest } from "../../program/ProgramImages";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { chunkOfAddress } from "../../program/ProgramChunk";
import { TOP_LEVEL_START, type ProgramAddress } from "../types/ProgramAddress";
import {
  buildRouteSimulator,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_STEPS,
  DEFAULT_SEARCH_TIMEOUT,
  extendSeq,
  lastSearchStats,
  type ChoiceOverride,
  type ConditionOverride,
  type RouteChoice,
  type RouteOverride,
  type RoutePlan,
  type RouteResumePoint,
  type RouteStep,
  type SearchCutReason,
  type SearchError,
  type SearchOptions,
  type SearchState,
} from "./planRoute";
import {
  gateWinsMenu,
  NO_PINS,
  pinnedAtMenu,
  pinnedOfferCounts,
  pinsNextOffer,
  type PinnedOptions,
} from "./routePins";

interface FallbackNode {
  state: SearchState;
  seq: string;
  steps: RouteStep[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  overrides: RouteOverride[];
}

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

interface FallbackRunResult {
  hitTarget: boolean;
  steps: RouteStep[];
  branches: FallbackNode[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  terminal: boolean;
}


interface SearchBudget {
  stepsRemaining: number;
  nodesRemaining: number;
  deadlineTime: number;
  cut: SearchCutReason | null;
  visited: Set<string>;
}

const stepBudgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.stepsRemaining <= 0) {
    budget.cut ??= "max-steps";
    return true;
  }
  if (now() >= budget.deadlineTime) {
    budget.cut ??= "timeout";
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

const pendingOverrideSignature = (
  overrides: RouteOverride[],
  snapshot: SimulatorSnapshot,
): string => {
  const skippedPerSite = new Map<string, number>();
  let signature = "";
  for (const override of overrides) {
    const site = `${override.kind}:${override.site}`;
    const replayed =
      (override.kind === "condition"
        ? snapshot.conditionPointer[override.site]
        : snapshot.choicePointer[override.site]) ?? 0;
    const skipped = skippedPerSite.get(site) ?? 0;
    if (skipped < replayed) {
      skippedPerSite.set(site, skipped + 1);
      continue;
    }
    signature = extendSeq(signature, `${site}=${override.value}`);
  }
  return signature;
};

const claimForkSite = (
  budget: SearchBudget,
  site: ProgramAddress,
  stateKey: string,
  overrides: RouteOverride[],
  snapshot: SimulatorSnapshot,
): boolean => {
  const key = `${site}|${stateKey}|${pendingOverrideSignature(
    overrides,
    snapshot,
  )}`;
  if (budget.visited.has(key)) {
    lastSearchStats.forkSitesSkipped += 1;
    return false;
  }
  budget.visited.add(key);
  return true;
};


export const planRouteFallback = (
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
  const budget: SearchBudget = {
    stepsRemaining: options?.maxSteps ?? DEFAULT_MAX_STEPS,
    nodesRemaining: options?.maxNodes ?? DEFAULT_MAX_NODES,
    deadlineTime: startTime + searchTimeout,
    cut: null,
    visited: new Set(),
  };
  const fromKnotName = from.split(".")[0] || "0";
  const positions = storyPositions(story);

  let routePlan: RoutePlan | null = null;
  let nodeErrored = false;
  const startingSteps = budget.stepsRemaining;
  const queue: FallbackNode[] = [];

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
    queue.push(
      options?.resumeFrom
        ? makeResumeNode(options.resumeFrom)
        : makeStartNode(story, from, port),
    );

    const raisedErrors = new Set<string>();
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

    while (queue.length) {
      if (searchBudgetExhausted(budget)) {
        break;
      }
      budget.nodesRemaining -= 1;
      lastSearchStats.nodesExpanded += 1;

      const node = isBfs ? queue.shift()! : queue.pop()!;
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
          options?.pins ?? NO_PINS,
        );

        if (result.hitTarget) {
          routePlan = {
            from,
            to,
            steps: result.steps,
            decisions: result.decisions,
            conditions: result.conditions,
            choices: result.choices,
          };
          break;
        }

        for (const b of result.branches) {
          queue.push(b);
        }
      } catch {
        nodeErrored = true;
      }
    }

    lastSearchStats.stepsUsed = startingSteps - budget.stepsRemaining;
    lastSearchStats.exhaustedBudget = budget.cut !== null;
    lastSearchStats.endReason = routePlan
      ? "found"
      : (budget.cut ?? (nodeErrored ? "errored" : "exhausted"));
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

const runUntilDecisionOrBranch = (
  story: Story,
  port: StatePort,
  node: FallbackNode,
  positions: StoryPositions,
  fromKnotName: string,
  target: ProgramAddress | null,
  stayWithinKnot: boolean,
  functions: string[],
  budget: SearchBudget,
  pinned: PinnedOptions,
): FallbackRunResult => {
  port.restore(node.state);
  story.state.ResetErrors();
  story.endedAt = null;

  const prevPauseBeforeEvaluatingConditions =
    story.pauseBeforeEvaluatingConditions;
  const prevSimulator = story.simulator;

  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  const branches: FallbackNode[] = [];
  let hitTarget = false;
  let terminal = false;

  let seq = node.seq;
  const stepsEncountered: RouteStep[] = [];

  try {
    while (true) {
      if (stepBudgetExhausted(budget)) {
        terminal = true;
        break;
      }
      budget.stepsRemaining -= 1;

      const previous = positions.previous();

      if (previous !== undefined) {
        if (
          stepsEncountered.length === 0 ||
          previous !== stepsEncountered.at(-1)?.address
        ) {
          seq = extendSeq(seq, previous);
          stepsEncountered.push({
            checkpoint: undefined,
            decision: node.decisions.length - 1,
            address: previous,
            seq,
          });
        }
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
          if (
            !claimForkSite(
              budget,
              site,
              fork.key,
              node.overrides,
              simulator.saveSnapshot(),
            )
          ) {
            terminal = true;
            break;
          }
          const options = story.currentChoices.map((c) => c.text);
          const sources = story.currentChoices.map((c) => c.sourcePath);
          const pinnedHere =
            pinned.offers.size > 0
              ? pinnedAtMenu(
                  pinned,
                  sources,
                  pinnedOfferCounts(node.choices, pinned),
                )
              : [];
          const first = pinnedHere[0] ?? 0;
          const order = [
            first,
            ...story.currentChoices.map((_, i) => i).filter((i) => i !== first),
          ];
          for (const i of order) {
            const choice = story.currentChoices[i]!;
            branches.push(
              forkChoice(
                forkState,
                node,
                stepsEncountered,
                {
                  kind: "choice",
                  site,
                  value: choice.sourcePath,
                },
                {
                  options,
                  selected: i,
                  sources,
                },
              ),
            );
          }
          break;
        }
      }

      if (!story.canContinue) {
        terminal = true;
        break;
      }

      if (stayWithinKnot && exitedKnot(story, positions, fromKnotName, functions)) {
        terminal = true;
        break;
      }

      story.pauseBeforeEvaluatingConditions = true;

      const stepsBefore = story.stepCount;
      story.stepLimit = stepsBefore + 1 + budget.stepsRemaining;
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
        budget.stepsRemaining -= Math.max(0, story.stepCount - stepsBefore - 1);
      }
      if (stopped) {
        budget.cut ??= "max-steps";
        terminal = true;
        break;
      }

      if (story.pausedBeforeCondition !== null) {
        stepsEncountered.pop();

        const fork = port.fork();
        const forkState = fork.state;
        if (
          !claimForkSite(
            budget,
            story.pausedBeforeCondition,
            fork.key,
            node.overrides,
            simulator.saveSnapshot(),
          )
        ) {
          terminal = true;
          break;
        }

        const programVerdict = story.pausedConditionValue;
        const forkVerdict = (value: boolean) =>
          forkCondition(
            forkState,
            node,
            stepsEncountered,
            {
              kind: "condition",
              site: story.pausedBeforeCondition!,
              value,
            },
            programVerdict,
          );
        const site = story.pausedBeforeCondition!;
        const counts = pinned.sites.has(site)
          ? pinnedOfferCounts(node.choices, pinned)
          : null;
        const gate =
          counts !== null &&
          pinsNextOffer(pinned, String(site), counts.get(String(site)) ?? 0) &&
          gateWinsMenu(
            pinned,
            story.state.generatedChoices.map((c) => c.sourcePath),
            counts,
          );
        if (gate) {
          branches.push(forkVerdict(true));
          branches.push(forkVerdict(false));
        } else {
          const natural = story.pausedJumpValue;
          for (const value of natural === false ? [false, true] : [true, false]) {
            branches.push(forkVerdict(value));
          }
        }
        break;
      }
    }
  } finally {
    story.pauseBeforeEvaluatingConditions = prevPauseBeforeEvaluatingConditions;
    story.simulator = prevSimulator;
  }

  return {
    hitTarget,
    branches,
    steps: [...node.steps, ...stepsEncountered],
    decisions: node.decisions,
    conditions: node.conditions,
    choices: node.choices,
    terminal,
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
): FallbackNode => {
  if (!story.stateIsPristine) {
    resetStory(story);
  }
  story.ChoosePathString(from);
  return {
    state: port.fork().state,
    seq: "",
    steps: [],
    decisions: [],
    conditions: [],
    choices: [],
    overrides: [],
  };
};

const makeResumeNode = (resumeFrom: RouteResumePoint): FallbackNode => ({
  state: resumeFrom.state,
  seq: resumeFrom.steps.at(-1)?.seq ?? "",
  steps: [...resumeFrom.steps],
  decisions: [...resumeFrom.decisions],
  conditions: [...resumeFrom.conditions],
  choices: [...resumeFrom.choices],
  overrides: [...resumeFrom.decisions],
});

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

const forkCondition = (
  state: SearchState,
  parent: FallbackNode,
  stepsEncountered: RouteStep[],
  ov: ConditionOverride,
  programVerdict: boolean | null,
): FallbackNode => {
  if (programVerdict === null) {
    ov = { ...ov, open: true };
  } else if (ov.value !== programVerdict) {
    ov = { ...ov, departs: true };
  }
  return {
    state,
    seq: stepsEncountered.at(-1)?.seq ?? parent.seq,
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions, { selected: ov.value }],
    choices: [...parent.choices],
    overrides: [...parent.overrides, ov],
  };
};

const forkChoice = (
  state: SearchState,
  parent: FallbackNode,
  stepsEncountered: RouteStep[],
  ov: ChoiceOverride,
  choice: RouteChoice,
): FallbackNode => {
  return {
    state,
    seq: stepsEncountered.at(-1)?.seq ?? parent.seq,
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions],
    choices: [...parent.choices, choice],
    overrides: [...parent.overrides, ov],
  };
};


const now = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

const NOOP = () => {};
