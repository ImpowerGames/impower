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
  /** Opaque identity of the sequence of paths taken to reach this step
   *  (see {@link extendSeq}) */
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

/**
 * Extend a step-sequence identity with one more path.
 *
 * The identity used to be the paths themselves, joined: `"a|b|c"`. Every step
 * stored the whole running string, and `Game.simulateRoute` then uses each one
 * as an object key — which forces V8 to flatten it into its own copy. A route
 * of N steps therefore held N strings averaging N/2 paths each: O(N²) bytes.
 * On a real project that is 241 MB of strings at 5,786 steps and ~1.8 GB at
 * 15,831, which is what made previewing deep inside a long scene exhaust
 * memory and kill the editor (#376).
 *
 * Only equality is ever asked of a `seq`, so the identity is folded into a
 * fixed-width hash instead: same history in, same value out, constant size.
 * Two 32-bit lanes (cyrb53-style) give ~2^53 distinct values, so across the
 * tens of thousands of steps a route can hold, two histories colliding is
 * vanishingly unlikely — and `Game.getCheckpoint` corroborates a match against
 * the step's own path, so even a collision costs a re-simulation rather than
 * resuming from an unrelated position.
 *
 * The value is meaningful only WITHIN one session's plans: it is compared
 * between an earlier plan and a re-plan (which is how checkpoint reuse works),
 * never persisted or parsed.
 */
export const extendSeq = (seq: string, path: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const input = seq ? `${seq}|${path}` : path;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36);
};

export type RouteOverride = ConditionOverride | ChoiceOverride;

export interface RouteStep {
  /** Opaque identity of the sequence of paths taken to reach this step. Two
   *  steps carry the same `seq` exactly when the same paths led to them, which
   *  is what lets a re-plan reuse an earlier plan's checkpoints
   *  (`Game.getCheckpoint`). Not parseable — see {@link extendSeq}. */
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

  /**
   * How many times the whole search may advance the story before giving up
   * (defaults to {@link DEFAULT_MAX_STEPS}).
   *
   * An author can write a story that never terminates, so the search needs a
   * ceiling. Counting work rather than elapsed time makes the ceiling mean the
   * same thing on an idle machine and a loaded one, which is what lets a
   * failure be reproduced and tested.
   *
   * The ceiling is set far above what any real script needs — it catches
   * runaway, it does not ration ordinary work.
   */
  maxSteps?: number;

  /**
   * How many search nodes the whole search may expand before giving up
   * (defaults to {@link DEFAULT_MAX_NODES}).
   *
   * A branchy story enqueues two nodes at every decision it passes, so the
   * queue can grow faster than it is consumed even while each individual node
   * is making progress.
   */
  maxNodes?: number;

  /**
   * Wall-clock backstop in milliseconds (defaults to
   * {@link DEFAULT_SEARCH_TIMEOUT}).
   *
   * The deterministic ceilings above are what decide the outcome for any
   * script anyone writes. This is the last line of defence against a search
   * whose individual steps cost far more than any measured step.
   *
   * It is a real ceiling, not a decorative one: at the measured cost of a step
   * it is reached at roughly two thirds of {@link DEFAULT_MAX_STEPS}, so a
   * story that runs away stops on the clock rather than the step count. What
   * it cannot do is fire on a script of any plausible length — the largest
   * scene measured needs well under a second of searching.
   */
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

/**
 * Story advances the whole search may make.
 *
 * A story costs almost exactly one advance per step of the route it produces,
 * and the ceiling has to be calibrated against what the EDITOR compiles rather
 * than a hand-built test fixture: the same 17,000-line scene costs about seven
 * advances per line as a bare fixture and about thirty-six through the editor's
 * own compile, because the editor's program is far finer-grained. Measured in
 * the running editor, a 17,000-line scene needs 611,984 advances and produces a
 * route of 575,839 steps.
 *
 * Two million is roughly three times that, which covers a single scene of
 * around 55,000 display lines — far beyond the largest real project here
 * (8,325 lines) — while still stopping a story that never terminates.
 */
export const DEFAULT_MAX_STEPS = 2_000_000;

/** Search nodes the whole search may expand. */
export const DEFAULT_MAX_NODES = 100_000;

/** See {@link SearchOptions.searchTimeout} — a backstop, not a policy. */
export const DEFAULT_SEARCH_TIMEOUT = 30_000;

interface SearchBudget {
  /** Story advances left before the search gives up */
  stepsRemaining: number;
  /** Node expansions left before the search gives up */
  nodesRemaining: number;
  /** Wall-clock backstop */
  deadlineTime: number;
  /** Set when a ceiling actually stopped something, at the point it did */
  cut: boolean;
  /** Fork sites already expanded (see {@link claimForkSite}) */
  visited: Set<string>;
}

/** Whether the story may be advanced again. The node budget is deliberately not
 *  consulted here: a node is charged before it runs, so counting it as
 *  exhausting the budget would abort the last permitted expansion before it
 *  advanced the story once, making every `maxNodes` mean one less than it
 *  says. */
const stepBudgetExhausted = (budget: SearchBudget): boolean => {
  // Recorded here rather than derived after the loop: a search that SUCCEEDS
  // using exactly its allowance leaves the counters at zero too, so counting
  // what is left cannot tell a search that was cut off from one that fit.
  if (budget.stepsRemaining <= 0 || now() >= budget.deadlineTime) {
    budget.cut = true;
    return true;
  }
  return false;
};

/** Whether another node may be expanded. */
const searchBudgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.nodesRemaining <= 0) {
    budget.cut = true;
    return true;
  }
  return stepBudgetExhausted(budget);
};

/**
 * The forced decisions a node has NOT yet replayed, folded to a fixed width.
 *
 * A node's overrides are every decision made on the route to it, and running
 * the node restores its state directly rather than replaying that route — so
 * the overrides for paths the node does not revisit stay queued, and would
 * still be forced if the story looped back onto one of those paths. Two
 * arrivals at the same story position therefore only behave the same if the
 * decisions still queued behind them are the same too, which is what this
 * captures.
 */
const pendingOverrideSignature = (
  overrides: RouteOverride[],
  snapshot: SimulatorSnapshot,
): string => {
  const skippedPerSite = new Map<string, number>();
  let signature = "";
  for (const override of overrides) {
    const site = `${override.kind}:${override.path}`;
    const replayed =
      (override.kind === "condition"
        ? snapshot.conditionPointer[override.path]
        : snapshot.choicePointer[override.path]) ?? 0;
    const skipped = skippedPerSite.get(site) ?? 0;
    if (skipped < replayed) {
      // Consumed on the way to this site, so it is not part of what still
      // distinguishes one arrival here from another.
      //
      // This is a summary, not a guarantee about the future: a CHILD forked
      // from here rebuilds the queue with its pointers back at zero, so an
      // override dropped here can fire again if the story returns to its path.
      // Dropping it is what lets two arrivals that differ only in already-spent
      // history share an entry; keeping it would make the key grow forever
      // along a loop and never match.
      skippedPerSite.set(site, skipped + 1);
      continue;
    }
    signature = extendSeq(signature, `${site}=${override.value}`);
  }
  return signature;
};

/**
 * Claim a fork site for expansion, returning false if an equivalent one has
 * already been expanded.
 *
 * What happens after a fork site is decided by the story state there plus the
 * forced decisions still queued behind it, and nothing else — so a second
 * arrival at the same pair would enqueue the same children the first arrival
 * already did, and expanding it again is wasted work. Breadth-first order
 * means the arrival that was kept is also the shortest route to that position.
 *
 * This prunes repetition; it is not what makes the search terminate. A story
 * that loops does not generally come back to the same state, because visit
 * counts advance every time round, so each lap is a genuinely new position and
 * this check never fires on it. {@link SearchOptions.maxSteps} is what ends
 * those searches.
 *
 * The state is folded to a fixed-width hash rather than kept whole: a route
 * can hold tens of thousands of steps, and holding a full serialized state per
 * fork site is what exhausted memory on long scenes in #376. Two distinct
 * positions colliding would cost a route the planner could otherwise have
 * found, but ~2^53 values across the thousands of sites a search visits makes
 * that vanishingly unlikely.
 *
 * Note that siblings of one fork share both their state and their queue — they
 * differ only in the decision each is about to make, which the simulator
 * applies while the child runs. That is why the check belongs at the site
 * being expanded and not on the nodes coming off the queue: applied to nodes,
 * it would collapse every branch of the story into whichever sibling happened
 * to be dequeued first.
 */
const claimForkSite = (
  budget: SearchBudget,
  sitePath: string,
  stateJson: string,
  overrides: RouteOverride[],
  snapshot: SimulatorSnapshot,
): boolean => {
  const key = `${sitePath}|${extendSeq("", stateJson)}|${pendingOverrideSignature(
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

/**
 * What the most recent {@link planRoute} call actually did.
 *
 * A failed search returns `null` whether it ran out of budget or genuinely
 * exhausted the story, and those are different answers: one means "ask again
 * with more room", the other means "this line cannot be reached". Recording it
 * is what lets a test tell a search that finished from one that was cut off,
 * and what lets a caller explain the failure rather than guess at it.
 *
 * Overwritten by every call. `planRoute` is synchronous, so this always
 * describes the call that just returned.
 */
export const lastSearchStats: {
  nodesExpanded: number;
  stepsUsed: number;
  /** Arrivals at a fork site that had already been expanded (see
   *  {@link claimForkSite}). Zero means the skip never fired, which for a
   *  looping story means something else ended the search. */
  forkSitesSkipped: number;
  /** True when a ceiling stopped the search, false when it ran out of story. */
  exhaustedBudget: boolean;
} = {
  nodesExpanded: 0,
  stepsUsed: 0,
  forkSitesSkipped: 0,
  exhaustedBudget: false,
};

export const planRoute = (
  story: Story,
  fromPath: string,
  toPath: string,
  options?: SearchOptions,
): RoutePlan | null => {
  lastSearchStats.nodesExpanded = 0;
  lastSearchStats.stepsUsed = 0;
  lastSearchStats.forkSitesSkipped = 0;
  lastSearchStats.exhaustedBudget = false;

  const start = makeStartNode(story, fromPath);
  const isBfs = (options?.searchStrategy ?? "bfs") === "bfs";
  const startTime = now();
  const searchTimeout = options?.searchTimeout ?? DEFAULT_SEARCH_TIMEOUT;
  const budget: SearchBudget = {
    stepsRemaining: options?.maxSteps ?? DEFAULT_MAX_STEPS,
    nodesRemaining: options?.maxNodes ?? DEFAULT_MAX_NODES,
    deadlineTime: startTime + searchTimeout,
    cut: false,
    visited: new Set(),
  };
  const favoredConditionalValues = options?.favoredConditions ?? [];
  const favoredChoiceIndices = options?.favoredChoices ?? [];
  const fromKnotName = fromPath.split(".")[0] || "0";

  let routePlan = null;
  const startingSteps = budget.stepsRemaining;
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
    if (searchBudgetExhausted(budget)) {
      break;
    }
    budget.nodesRemaining -= 1;
    lastSearchStats.nodesExpanded += 1;

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
        budget,
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

  lastSearchStats.stepsUsed = startingSteps - budget.stepsRemaining;
  // Read from the budget itself, not from where the loop happened to exit: the
  // step ceiling is reached inside a node run, which ends that node and then
  // drains the queue normally, so the outer loop can exit looking healthy on a
  // search that was in fact cut off.
  lastSearchStats.exhaustedBudget = budget.cut;

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
  budget: SearchBudget,
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
      if (stepBudgetExhausted(budget)) {
        terminal = true;
        break;
      }
      budget.stepsRemaining -= 1;

      const previousPath = story.state.previousPointer.path?.toString()!;

      if (previousPath) {
        if (
          stepsEncountered.length === 0 ||
          previousPath !== stepsEncountered.at(-1)?.path
        ) {
          seq = extendSeq(seq, previousPath);
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
            (choice) => choice.sourcePath === forcedSourcePath,
          );
          if (forced) {
            // Force a choice
            story.ChooseChoice(forced);
          }
        } else {
          // Pop the last encountered step,
          // because we're going to encounter it again on the next run
          stepsEncountered.pop();
          // Serialize once and share it with every sibling: they all fork from
          // this same position.
          const forkStateJson = story.state.toJson();
          if (
            !claimForkSite(
              budget,
              previousPath,
              forkStateJson,
              node.overrides,
              simulator.saveSnapshot(),
            )
          ) {
            // Already expanded from this exact position, so its children are
            // already queued.
            terminal = true;
            break;
          }
          const options = story.currentChoices.map((c) => c.text);
          const favoredChoiceIndex = favoredChoiceIndices[node.choices.length];
          if (favoredChoiceIndex != null) {
            const choice = story.currentChoices[favoredChoiceIndex]!;
            if (choice) {
              // Fork choice branch
              branches.push(
                forkChoice(
                  forkStateJson,
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
                  },
                ),
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
                forkStateJson,
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
                },
              ),
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

        // Serialize once and share it with both branches: they fork from this
        // same position.
        const forkStateJson = story.state.toJson();
        if (
          !claimForkSite(
            budget,
            story.pausedBeforeCondition,
            forkStateJson,
            node.overrides,
            simulator.saveSnapshot(),
          )
        ) {
          // Already expanded from this exact position, so both branches are
          // already queued.
          terminal = true;
          break;
        }

        const favoredConditionalValue =
          favoredConditionalValues[node.conditions.length];
        if (favoredConditionalValue != null) {
          // Fork favored branch
          branches.push(
            forkCondition(forkStateJson, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: favoredConditionalValue,
            }),
          );
          // Fork opposite of favored branch
          branches.push(
            forkCondition(forkStateJson, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: !favoredConditionalValue,
            }),
          );
        } else {
          // Fork true branch
          branches.push(
            forkCondition(forkStateJson, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: true,
            }),
          );
          // Fork false branch
          branches.push(
            forkCondition(forkStateJson, node, stepsEncountered, {
              kind: "condition",
              path: story.pausedBeforeCondition,
              value: false,
            }),
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
  // End any line the story is part-way through rather than running it to its
  // end. `ResetState` below refuses to run while a line is open, but finishing
  // the line is not a way out of that: `Story.Continue` advances until the line
  // ends, and a story sitting in a loop that never completes a line never ends.
  //
  // The search reaches here mid-line as a matter of course — it drives the
  // story one step at a time and stops on its own step budget — so this ran
  // forever on exactly the stories the budget exists to survive, and it ran
  // before any of the engine's own recovery paths could (#386). The line is
  // discarded on the next statement regardless, so there was never anything to
  // gain by running it.
  story.CancelAsyncContinue();
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
  functions: string[],
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
  stateJson: string,
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ConditionOverride,
): SearchNode => {
  return {
    stateJson,
    // Falls back to the PARENT's identity, not to "": a fork commonly happens
    // with `stepsEncountered` empty (the pending step is popped just before
    // forking), and restarting the chain there would give two sibling branches
    // the same identity for every path they later share — which
    // `Game.patchAndSimulateRoute` would read as "already simulated".
    seq: stepsEncountered.at(-1)?.seq ?? parent.seq,
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions, { selected: ov.value }],
    choices: [...parent.choices],
    overrides: [...parent.overrides, ov],
  };
};

const forkChoice = (
  stateJson: string,
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ChoiceOverride,
  choice: { options: string[]; selected: number },
): SearchNode => {
  return {
    stateJson,
    // See forkCondition: the parent's identity, never a fresh chain.
    seq: stepsEncountered.at(-1)?.seq ?? parent.seq,
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions],
    choices: [...parent.choices, choice],
    overrides: [...parent.overrides, ov],
  };
};

export const buildRouteSimulator = (
  decisions: RouteOverride[],
  fromDecision = 0,
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
    key: string,
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
