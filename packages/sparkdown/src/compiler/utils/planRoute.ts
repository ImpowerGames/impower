import { Simulator, SimulatorSnapshot } from "../../inkjs/engine/Simulator";
import { Story } from "../../inkjs/engine/Story";

export interface RoutePlan {
  /** The path to start from */
  fromPath: string;
  /** The path to end at */
  toPath: string;
  /** The sequence of steps that led here */
  steps: RouteStep[];
  /** The decisions in the order you'll make them along the route. */
  decisions: RouteOverride[];
  /** The conditions in the order you'll encounter them along the route */
  conditions: { selected: boolean }[];
  /** The choices in the order you'll encounter them along the route */
  choices: { options: string[]; selected: number }[];
}

export interface SearchNode {
  /** StoryState serialized via story.state.toJson() */
  stateJson: string;
  /** A string that represents the sequence of paths taken to reach this step */
  seq: string;
  /** The sequence of steps that led here */
  steps: RouteStep[];
  /** The sequence of forced decisions that led here */
  decisions: RouteOverride[];
  /** The sequence of forced conditions that led here */
  conditions: { selected: boolean }[];
  /** The sequence of forced choices that led here */
  choices: { options: string[]; selected: number }[];
  /** The overrides to enforce when running this node */
  overrides: RouteOverride[];
}

export type RouteOverride = ConditionOverride | ChoiceOverride;

export interface RouteStep {
  /** A string that represents the sequence of paths taken to reach this step */
  seq: string;
  /** The path encountered this step */
  path: string;
  /** The index of the latest decision made so far */
  decision: number;
  /** The index of the latest checkpoint made so far */
  checkpoint?: number;
}

export interface ConditionOverride {
  kind: "condition";
  path: string;
  value: boolean;
}

export interface ChoiceOverride {
  kind: "choice";
  path: string;
  value: string;
}

export interface SearchOptions {
  /** Breadth-first (default) or depth-first search strategy */
  searchStrategy?: "bfs" | "dfs";

  /** Hard time limit (in milliseconds) of how long to search before giving up (defaults to 1000 to protect against infinite loops) */
  searchTimeout?: number;

  /**
   * If true (default), planner prunes any branch that diverts outside
   * the starting knot. Set false to allow cross-knot routes.
   */
  stayWithinKnot?: boolean;

  /**
   * If provided, entering functions are not considered as exiting the knot
   */
  functions?: string[];

  /**
   * If provided, these choices will be given higher priority when searching for a route
   */
  favoredChoices?: (number | undefined)[];

  /**
   * If provided, these condition values will be given higher priority when searching for a route
   */
  favoredConditions?: (boolean | undefined)[];
}

// Drives the story forward until we either:
//   - hit a decision site (returns {branches}) OR
//   - hit a terminal (dead end / left knot / timeout) OR
//   - (optionally) hit a specific target path.
// Also returns all runtime paths we stepped through in this segment.
export interface RunResult {
  hitTarget: boolean;
  steps: RouteStep[];
  branches: SearchNode[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: { options: string[]; selected: number }[];
  terminal: boolean; //  true if branch ended this run
}

export const planRoute = (
  story: Story,
  fromPath: string,
  toPath: string,
  options?: SearchOptions
): RoutePlan | null => {
  const start = makeStartNode(story, fromPath);
  const isBfs = (options?.searchStrategy ?? "bfs") === "bfs";
  const startTime = now();
  const searchTimeout = options?.searchTimeout ?? 1000;
  const deadlineTime = startTime + searchTimeout;
  const favoredConditionalValues = options?.favoredConditions ?? [];
  const favoredChoiceIndices = options?.favoredChoices ?? [];
  const fromKnotName = fromPath.split(".")[0] || "0";

  let routePlan = null;

  const queue: SearchNode[] = [start];

  const prevOnError = story.onError;
  const prevOnExecute = story.onExecute;
  const prevOnMakeChoice = story.onMakeChoice;
  const prevOnEvaluateCondition = story.onEvaluateCondition;
  const prevOnSaveStateSnapshot = story.onSaveStateSnapshot;
  const prevOnRestoreStateSnapshot = story.onRestoreStateSnapshot;
  const prevOnDiscardStateSnapshot = story.onDiscardStateSnapshot;

  story.onError = NOOP;
  story.onExecute = NOOP;
  story.onMakeChoice = NOOP;
  story.onEvaluateCondition = NOOP;
  story.onSaveStateSnapshot = NOOP;
  story.onRestoreStateSnapshot = NOOP;
  story.onDiscardStateSnapshot = NOOP;

  while (queue.length) {
    if (deadlineTime != null && now() >= deadlineTime) {
      break;
    }

    const node = isBfs ? queue.shift()! : queue.pop()!;
    try {
      const result = runUntilDecisionOrBranch(
        story,
        node,
        fromKnotName,
        toPath,
        favoredChoiceIndices,
        favoredConditionalValues,
        options?.stayWithinKnot !== false,
        options?.functions || [],
        deadlineTime
      );

      if (result.hitTarget) {
        routePlan = {
          fromPath,
          toPath,
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
    } catch {}
  }

  resetStory(story);

  story.onError = prevOnError;
  story.onExecute = prevOnExecute;
  story.onMakeChoice = prevOnMakeChoice;
  story.onEvaluateCondition = prevOnEvaluateCondition;
  story.onSaveStateSnapshot = prevOnSaveStateSnapshot;
  story.onRestoreStateSnapshot = prevOnRestoreStateSnapshot;
  story.onDiscardStateSnapshot = prevOnDiscardStateSnapshot;

  return routePlan;
};

const runUntilDecisionOrBranch = (
  story: Story,
  node: SearchNode,
  fromKnotName: string,
  targetPath: string | null, // set null for "enumerate all"
  favoredChoiceIndices: (number | undefined)[],
  favoredConditionalValues: (boolean | undefined)[],
  stayWithinKnot: boolean,
  functions: string[],
  deadlineTime: number
): RunResult => {
  // 1) Restore snapshot
  story.state.LoadJson(node.stateJson);
  story.state.ResetErrors();

  let lastSimulatorSnapshot: SimulatorSnapshot | undefined = undefined;

  const prevPauseBeforeEvaluatingConditions =
    story.pauseBeforeEvaluatingConditions;
  const prevSimulator = story.simulator;
  const prevOnSaveStateSnapshot = story.onSaveStateSnapshot;
  const prevOnRestoreStateSnapshot = story.onRestoreStateSnapshot;
  const prevOnDiscardStateSnapshot = story.onDiscardStateSnapshot;

  // Build a simulator from *this node's* overrides (streams per path)
  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  story.onSaveStateSnapshot = () => {
    lastSimulatorSnapshot = simulator.saveSnapshot();
  };

  story.onRestoreStateSnapshot = () => {
    if (lastSimulatorSnapshot) {
      simulator.restoreSnapshot(lastSimulatorSnapshot);
    }
  };

  story.onDiscardStateSnapshot = () => {
    lastSimulatorSnapshot = undefined;
  };

  const branches: SearchNode[] = [];
  let hitTarget = false;
  let terminal = false;

  let seq = node.seq;
  const stepsEncountered: RouteStep[] = [];

  try {
    // Tight loop: advance until target or branch site
    while (true) {
      // Timeout check
      if (deadlineTime != null && now() >= deadlineTime) {
        terminal = true;
        break;
      }

      const previousPath = story.state.previousPointer.path?.toString()!;

      if (previousPath) {
        if (
          stepsEncountered.length === 0 ||
          previousPath !== stepsEncountered.at(-1)?.path
        ) {
          if (seq) {
            seq += "|";
          }
          seq += previousPath;
          stepsEncountered.push({
            checkpoint: undefined,
            decision: node.decisions.length - 1,
            path: previousPath,
            seq,
          });
        }
      }

      // A) Target reached?
      if (previousPath === targetPath) {
        hitTarget = true;
        terminal = true;
        break;
      }

      // B) Story requires choice to advance
      if (!story.canContinue && story.currentChoices.length > 0) {
        if (simulator.willForceChoice(previousPath)) {
          const forcedSourcePath = simulator?.forceChoice(previousPath);
          const forced = story.currentChoices.find(
            (choice) => choice.sourcePath === forcedSourcePath
          );
          if (forced) {
            // Force a choice
            story.ChooseChoice(forced);
          }
        } else {
          // Pop the last encountered step,
          // because we're going to encounter it again on the next run
          stepsEncountered.pop();
          const options = story.currentChoices.map((c) => c.text);
          const favoredChoiceIndex = favoredChoiceIndices[node.choices.length];
          if (favoredChoiceIndex != null) {
            const choice = story.currentChoices[favoredChoiceIndex]!;
            if (choice) {
              // Fork choice branch
              branches.push(
                forkChoice(
                  story,
                  node,
                  stepsEncountered,
                  {
                    kind: "choice",
                    path: previousPath,
                    value: choice.sourcePath,
                  },
                  {
                    options,
                    selected: favoredChoiceIndex,
                  }
                )
              );
            }
          }
          for (let i = 0; i < story.currentChoices.length; i++) {
            if (i === favoredChoiceIndex) {
              // Skip forking favored choice since we already forked it earlier
              terminal = true;
              continue;
            }
            const choice = story.currentChoices[i]!;
            // Fork choice branch
            branches.push(
              forkChoice(
                story,
                node,
                stepsEncountered,
                {
                  kind: "choice",
                  path: previousPath,
                  value: choice.sourcePath,
                },
                {
                  options,
                  selected: i,
                }
              )
            );
          }
          break;
        }
      }

      // C) If we can't continue and there are no choices, this is a dead end
      if (!story.canContinue) {
        terminal = true;
        break;
      }

      // D) Stay within starting knot?
      if (stayWithinKnot && exitedKnot(story, fromKnotName, functions)) {
        terminal = true;
        break;
      }

      // Ask the engine to pause before evaluating conditions
      story.pauseBeforeEvaluatingConditions =
        !simulator.willForceCondition(previousPath);

      story.ContinueAsync(Infinity); // this may hit a condition divert

      if (story.pausedBeforeCondition) {
        // Pop the last encountered step,
        // because we're going to encounter it again on the next run
        stepsEncountered.pop();

        const favoredConditionalValue =
          favoredConditionalValues[node.conditions.length];
        if (favoredConditionalValue != null) {
          // Fork favored branch
          branches.push(
            forkCondition(story, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: favoredConditionalValue,
            })
          );
          // Fork opposite of favored branch
          branches.push(
            forkCondition(story, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: !favoredConditionalValue,
            })
          );
        } else {
          // Fork true branch
          branches.push(
            forkCondition(story, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: true,
            })
          );
          // Fork false branch
          branches.push(
            forkCondition(story, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: false,
            })
          );
        }
        break;
      }

      // else: keep looping to advance further toward target/branch
    }
  } finally {
    // Restore hooks
    story.pauseBeforeEvaluatingConditions = prevPauseBeforeEvaluatingConditions;
    story.simulator = prevSimulator;
    story.onSaveStateSnapshot = prevOnSaveStateSnapshot;
    story.onRestoreStateSnapshot = prevOnRestoreStateSnapshot;
    story.onDiscardStateSnapshot = prevOnDiscardStateSnapshot;
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
  if (story.canContinue && !story.asyncContinueComplete) {
    story.Continue();
  }
  story.ResetState();
};

const makeStartNode = (story: Story, fromPath: string): SearchNode => {
  // Reset to fresh state and jump to knot start
  resetStory(story);
  story.ChoosePathString(fromPath);
  return {
    stateJson: story.state.toJson(),
    seq: "",
    steps: [],
    decisions: [],
    conditions: [],
    choices: [],
    overrides: [],
  };
};

const exitedKnot = (
  story: Story,
  knotName: string,
  functions: string[]
): boolean => {
  const ptr = story.state.currentPointer;

  // If there's no valid pointer yet, we haven't left anything.
  // (e.g., before first Continue or at container boundaries.)
  if (!ptr || ptr.isNull) {
    return false;
  }
  const curPath = ptr.path?.toString(); // absolute runtime path string

  const curKnot = curPath?.split(".")[0] || "0";

  if (functions.includes(curKnot)) {
    // Entering functions don't count as exiting the knot,
    // since they are guaranteed to return flow to the knot
    return false;
  }

  if (!Number.isNaN(curKnot)) {
    // Is root level
    return false;
  }

  const inside = curKnot === knotName;

  return !inside;
};

const forkCondition = (
  story: Story,
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ConditionOverride
): SearchNode => {
  return {
    stateJson: story.state.toJson(),
    seq: stepsEncountered.at(-1)?.seq || "",
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions, { selected: ov.value }],
    choices: [...parent.choices],
    overrides: [...parent.overrides, ov],
  };
};

const forkChoice = (
  story: Story,
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ChoiceOverride,
  choice: { options: string[]; selected: number }
): SearchNode => {
  return {
    stateJson: story.state.toJson(),
    seq: stepsEncountered.at(-1)?.seq || "",
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions],
    choices: [...parent.choices, choice],
    overrides: [...parent.overrides, ov],
  };
};

export const buildRouteSimulator = (
  decisions: RouteOverride[],
  fromDecision = 0
): Simulator => {
  const condQueues = new Map<string, boolean[]>();
  const conditionPointers = new Map<string, number>();
  const choiceQueues = new Map<string, string[]>();
  const choicePointers = new Map<string, number>();

  // Only enqueue overrides starting at `fromDecision`
  const pending = fromDecision > 0 ? decisions.slice(fromDecision) : decisions;

  // group into queues in-order
  for (const s of pending) {
    if (s.kind === "condition") {
      const q = condQueues.get(s.path) ?? [];
      q.push(s.value);
      condQueues.set(s.path, q);
    } else {
      const q = choiceQueues.get(s.path) ?? [];
      q.push(s.value);
      choiceQueues.set(s.path, q);
    }
  }

  const nextFrom = <T>(
    queues: Map<string, T[]>,
    pointers: Map<string, number>,
    key: string
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
    return v ?? null;
  };

  const saveSnapshot = (): SimulatorSnapshot => ({
    conditionPointer: Object.fromEntries(conditionPointers),
    choicePointer: Object.fromEntries(choicePointers),
  });

  const restoreSnapshot = (snap: SimulatorSnapshot) => {
    conditionPointers.clear();
    for (const [k, v] of Object.entries(snap.conditionPointer)) {
      conditionPointers.set(k, v);
    }
    choicePointers.clear();
    for (const [k, v] of Object.entries(snap.choicePointer)) {
      choicePointers.set(k, v);
    }
  };

  const willForceCondition = (sitePath: string) => {
    const q = condQueues.get(sitePath);
    if (!q) {
      return false;
    }
    const i = conditionPointers.get(sitePath) ?? 0;
    return i < q.length;
  };

  const willForceChoice = (sitePath: string) => {
    const q = choiceQueues.get(sitePath);
    if (!q) {
      return false;
    }
    const i = choicePointers.get(sitePath) ?? 0;
    return i < q.length;
  };

  return {
    forceCondition: (sitePath: string): boolean | null =>
      nextFrom(condQueues, conditionPointers, sitePath),
    forceChoice: (sitePath: string): string | null =>
      nextFrom(choiceQueues, choicePointers, sitePath),
    willForceCondition,
    willForceChoice,
    saveSnapshot,
    restoreSnapshot,
  };
};

const now = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

const NOOP = () => {};
