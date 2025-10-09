import { Simulator, SimulatorSnapshot } from "../inkjs/engine/Simulator";
import { Story } from "../inkjs/engine/Story";

export type RouteOverride = ConditionOverride | ChoiceOverride;

export type ConditionOverride = {
  kind: "condition";
  path: string;
  value: boolean;
};

export type ChoiceOverride = { kind: "choice"; path: string; value: string }; // choose among generated choices

export type RoutePlan = {
  /** The steps in the order you’ll encounter them when walking from the start of the knot */
  steps: RouteOverride[];
  /** The choices in the order you’ll encounter them when walking from the start of the knot */
  choices: { options: string[]; selected: number }[];
};

export interface SearchNode {
  /** StoryState serialized via story.state.toJson() */
  stateJson: string;
  /** The sequence of forced decisions that led here */
  steps: RouteOverride[];
  /** The sequence of forced choices that led here */
  choices: { options: string[]; selected: number }[];
  /** The overrides to enforce when running this node */
  overrides: RouteOverride[];
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
  favoredChoiceIndices?: (number | undefined)[];
}

/** A branching site detected during planning */
export type DecisionSite =
  | { kind: "condition"; path: string }
  | { kind: "choice"; path: string; count: number };

export const planRoute = (
  story: Story,
  fromPath: string,
  toPath: string,
  options?: SearchOptions
): RoutePlan | null => {
  const start = makeStartNode(story, fromPath);
  const targetPath = toPath;
  const isBfs = (options?.searchStrategy ?? "bfs") === "bfs";
  const startTime = now();
  const searchTimeout = options?.searchTimeout ?? 1000;
  const deadlineTime = startTime + searchTimeout;
  const favoredChoiceIndices = options?.favoredChoiceIndices ?? [];
  const fromKnotName = fromPath.split(".")[0] || "0";

  const queue: SearchNode[] = [start];

  while (queue.length) {
    if (deadlineTime != null && now() >= deadlineTime) {
      return null;
    }

    const node = isBfs ? queue.shift()! : queue.pop()!;
    try {
      const result = runUntilDecisionOrTarget(
        story,
        node,
        fromKnotName,
        targetPath,
        favoredChoiceIndices,
        options?.stayWithinKnot !== false,
        options?.functions || [],
        deadlineTime
      );
      if (result.hitTarget) {
        resetStory(story);
        return {
          steps: result.steps,
          choices: result.choices,
        };
      }
      for (const branch of result.branches) {
        queue.push(branch);
      }
    } catch {}
  }

  resetStory(story);

  return null;
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
    steps: [],
    choices: [],
    overrides: [],
  };
};

const runUntilDecisionOrTarget = (
  story: Story,
  node: SearchNode,
  fromKnotName: string,
  targetPath: string,
  favoredChoiceIndices: (number | undefined)[],
  stayWithinKnot: boolean,
  functions: string[],
  deadlineTime: number
) => {
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

  // Build a forcer from *this node's* overrides (streams per path)
  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  story.onSaveStateSnapshot = () => {
    lastSimulatorSnapshot = simulator.saveSnapshot();
    prevOnSaveStateSnapshot?.();
  };

  story.onRestoreStateSnapshot = () => {
    if (lastSimulatorSnapshot) {
      simulator.restoreSnapshot(lastSimulatorSnapshot);
    }
    prevOnRestoreStateSnapshot?.();
  };

  story.onDiscardStateSnapshot = () => {
    lastSimulatorSnapshot = undefined;
    prevOnDiscardStateSnapshot?.();
  };

  const branches: SearchNode[] = [];
  let hitTarget = false;

  try {
    // Tight loop: advance until target or branch site
    while (true) {
      // Timeout check
      if (deadlineTime != null && now() >= deadlineTime) {
        break;
      }

      const previousPath = story.state.previousPointer.path?.toString()!;
      const currentPath = story.state.currentPointer.path?.toString()!;

      // Ask the engine to pause before evaluating conditions
      story.pauseBeforeEvaluatingConditions =
        !simulator.willForceCondition(currentPath);

      // A) Target reached?
      if (previousPath === targetPath) {
        hitTarget = true;
        break;
      }

      // B) Stay within starting knot?
      if (stayWithinKnot && exitedKnot(story, fromKnotName, functions)) {
        break;
      }

      // C) Story requires choice to advance
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
              continue;
            }
            const choice = story.currentChoices[i]!;
            // Fork choice branch
            branches.push(
              forkChoice(
                story,
                node,
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

      // D) If we can't continue and there are no choices, this is a dead end
      if (!story.canContinue) {
        break;
      }

      story.ContinueAsync(Infinity); // this may hit a conditional divert

      if (story.pausedBeforeCondition) {
        // Fork true branch
        branches.push(
          forkCondition(story, node, {
            kind: "condition",
            path: story.pausedBeforeCondition,
            value: true,
          })
        );
        // Fork false branch
        branches.push(
          forkCondition(story, node, {
            kind: "condition",
            path: story.pausedBeforeCondition,
            value: false,
          })
        );
        break;
      }

      // else: keep looping to advance further toward target/branch
    }
  } finally {
    // Restore hooks/forcer so planner state doesn't leak
    story.pauseBeforeEvaluatingConditions = prevPauseBeforeEvaluatingConditions;
    story.simulator = prevSimulator;
    story.onSaveStateSnapshot = prevOnSaveStateSnapshot;
    story.onRestoreStateSnapshot = prevOnRestoreStateSnapshot;
    story.onDiscardStateSnapshot = prevOnDiscardStateSnapshot;
  }

  return { hitTarget, branches, steps: node.steps, choices: node.choices };
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

  const inside = curKnot === knotName;

  return !inside;
};

const forkCondition = (
  story: Story,
  parent: SearchNode,
  ov: ConditionOverride
): SearchNode => {
  return {
    stateJson: story.state.toJson(),
    steps: [...parent.steps, ov],
    choices: [...parent.choices],
    overrides: [...parent.overrides, ov],
  };
};

const forkChoice = (
  story: Story,
  parent: SearchNode,
  ov: ChoiceOverride,
  choice: { options: string[]; selected: number }
): SearchNode => {
  return {
    stateJson: story.state.toJson(),
    steps: [...parent.steps, ov],
    choices: [...parent.choices, choice],
    overrides: [...parent.overrides, ov],
  };
};

export const buildRouteSimulator = (steps: RouteOverride[]): Simulator => {
  const condQueues = new Map<string, boolean[]>();
  const conditionPointers = new Map<string, number>();
  const choiceQueues = new Map<string, string[]>();
  const choicePointers = new Map<string, number>();

  // group into queues in-order
  for (const s of steps) {
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
