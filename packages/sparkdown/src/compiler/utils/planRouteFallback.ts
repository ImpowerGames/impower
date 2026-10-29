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
  /** The state the node runs from, which siblings share. */
  state: SearchState;
  /** Opaque identity of the sequence of addresses taken to reach this step
   *  (see {@link extendSeq}) */
  seq: string;
  /** The sequence of steps that led here */
  steps: RouteStep[];
  /** The sequence of forced decisions that led here */
  decisions: RouteOverride[];
  /** The sequence of forced conditions that led here */
  conditions: { selected: boolean }[];
  /** The sequence of forced choices that led here */
  choices: RouteChoice[];
  /** The overrides to enforce when running this node */
  overrides: RouteOverride[];
}

interface StoryPositions {
  /** The address of the position the story's last step ran, or nothing
   *  before one has. */
  previous(): ProgramAddress | undefined;
  /** The flow the story's next step runs in. */
  knot(): string;
  /** Whether a flow on the story's call stack is `knot`. */
  stackHolds(knot: string): boolean;
  /** The address of the step that raised an error. */
  errorAddress(
    raised: { path?: string | null; address?: number } | null | undefined,
  ): ProgramAddress | null;
}

// The scene each chunk of a root stands in, found once per chunk.
const chunkScenes = new WeakMap<ProgramRoot, Map<number, string>>();

/** The flow an address of `root` stands in, as a route search keeps to its
 *  scene: its scene's name, or `"0"` for the top level, a declaration, or a
 *  chunk the root does not hold. */
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
  // The scene of the sequence the story last stood in, which most steps
  // share: the scene follows from the sequence alone.
  let lastSequence: SequenceRow | null = null;
  let lastScene = "0";
  return {
    previous: () => {
      const address = story.previousAddress;
      // An `End` (a `fin`) forgets where the story stood as it ends it; the
      // step that ran it is still a step of the route, and can reach its
      // target.
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
    // The instruction that raised the error, as the error recorded it: the
    // story it ended no longer says where it stood.
    errorAddress: (raised) => {
      if (raised?.address !== undefined) {
        return raised.address;
      }
      const address = story.previousAddress;
      return address >= 0 ? address : null;
    },
  };
};

/** How a search forks the story's state and runs a node from it. */
interface StatePort {
  /** The state as it stands, and the key a fork site is claimed by. */
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

// Drives the story forward until we either:
//   - hit a decision site (returns {branches}) OR
//   - hit a terminal (dead end / left knot / timeout) OR
//   - (optionally) hit a specific target path.
// Also returns all runtime paths we stepped through in this segment.

interface FallbackRunResult {
  hitTarget: boolean;
  steps: RouteStep[];
  branches: FallbackNode[];
  decisions: RouteOverride[];
  conditions: { selected: boolean }[];
  choices: RouteChoice[];
  terminal: boolean; //  true if branch ended this run
}


interface SearchBudget {
  /** Story advances left before the search gives up */
  stepsRemaining: number;
  /** Node expansions left before the search gives up */
  nodesRemaining: number;
  /** Wall-clock backstop */
  deadlineTime: number;
  /** Which ceiling actually stopped something, recorded at the point it did;
   *  null while none has. The first one to fire is kept, because that is the
   *  one that stopped the work — a later check finding a second ceiling also
   *  spent is describing the same stop. */
  cut: SearchCutReason | null;
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

/** Whether another node may be expanded. */
const searchBudgetExhausted = (budget: SearchBudget): boolean => {
  if (budget.nodesRemaining <= 0) {
    budget.cut ??= "max-nodes";
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
    const site = `${override.kind}:${override.site}`;
    const replayed =
      (override.kind === "condition"
        ? snapshot.conditionPointer[override.site]
        : snapshot.choicePointer[override.site]) ?? 0;
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


/**
 * Search for a way from the top of the flow `from` to the address `to`, by
 * stepping the story and forking it at every decision. A step is known by the
 * address of the position it stands at (docs/engine/binary-program.md,
 * section 8), folded into a running identity (`extendSeq`).
 */
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
  /** Set when a node run threw (see the catch in the search loop). */
  let nodeErrored = false;
  const startingSteps = budget.stepsRemaining;
  const queue: FallbackNode[] = [];

  const port = statePort(story, options?.stateImages !== false);
  const prevOnError = story.onError;
  const prevOnExecute = story.onExecute;
  const prevOnMakeChoice = story.onMakeChoice;
  const prevOnEvaluateCondition = story.onEvaluateCondition;
  // A story that keeps the image of each beat for its game's checkpoints
  // (`ProgramStory.keepBeatImages`) keeps none while the search steps it: a
  // search node holds the images it forks, and a beat's image is the
  // checkpoint's, which the replay after the search takes.
  const beatImages = story as unknown as { keepBeatImages?: boolean };
  const prevKeepBeatImages = beatImages.keepBeatImages;
  if (prevKeepBeatImages !== undefined) {
    beatImages.keepBeatImages = false;
  }

  try {
    // Inside the guarded region, and before the hooks are replaced: the start
    // node is built under the story owner's own hooks, as the rest of the
    // search is not.
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
    // Null rather than a do-nothing function: the engine builds the text of a
    // pointer's path to hand to this hook, and skips that build only when the
    // hook is null. The search never wants the hook to fire, so a function
    // here buys a discarded string on every step.
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
        // Swallowed so one bad node cannot abort a search that other branches
        // might still complete — but remembered, because it means this search no
        // longer covers the whole story and must not claim that it does.
        nodeErrored = true;
      }
    }

    lastSearchStats.stepsUsed = startingSteps - budget.stepsRemaining;
    // Read from the budget itself, not from where the loop happened to exit: the
    // step ceiling is reached inside a node run, which ends that node and then
    // drains the queue normally, so the outer loop can exit looking healthy on a
    // search that was in fact cut off.
    lastSearchStats.exhaustedBudget = budget.cut !== null;
    // A search that reached the target succeeded, whatever the ceilings say: one
    // that fired on the very run that arrived did not stop it arriving.
    //
    // A ceiling outranks a thrown node because the ceiling is what stopped the
    // work, and "I did not finish looking" stays true whether or not something
    // also broke along the way. Only the no-ceiling case has to consult the
    // error, and there it matters: without it a search that crashed on its very
    // first node reports itself as having explored the whole story and found no
    // way through, which is the one verdict here that blames the author's script.
    lastSearchStats.endReason = routePlan
      ? "found"
      : (budget.cut ?? (nodeErrored ? "errored" : "exhausted"));
  } finally {
    // In a `finally` so that a search which breaks somewhere the per-node catch
    // does not cover still hands the story back the way it found it: reset, and
    // running under its owner's hooks rather than the search's silent ones.
    try {
      // The reset is the caller's when the caller says it replaces the state
      // itself — but only on a route, because a search that came back
      // empty-handed is the last thing to have moved this story.
      if (!routePlan || !options?.callerResetsStory) {
        resetStory(story);
      } else {
        // The search drives the story with `ContinueAsync`, so a route that
        // ends mid-line leaves an async continue open, and `ResetState`
        // refuses to run while one is. Ending it costs nothing — the line is
        // discarded by whatever the caller does next — and it keeps the
        // promise this option makes: the caller can reset or load straight
        // away.
        story.CancelAsyncContinue();
      }
    } finally {
      // After the reset, which runs under the search's silent hooks: an error
      // raised while resetting belongs to the search, not to the next thing
      // the owner does with the story.
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
  target: ProgramAddress | null, // set null for "enumerate all"
  stayWithinKnot: boolean,
  functions: string[],
  budget: SearchBudget,
  pinned: PinnedOptions,
): FallbackRunResult => {
  // 1) Restore snapshot
  port.restore(node.state);
  story.state.ResetErrors();
  // No step of this node has run, so none has ended the story.
  story.endedAt = null;

  const prevPauseBeforeEvaluatingConditions =
    story.pauseBeforeEvaluatingConditions;
  const prevSimulator = story.simulator;

  // Build a simulator from *this node's* overrides (streams per path)
  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  const branches: FallbackNode[] = [];
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

      // A) Target reached?
      if (previous !== undefined && previous === target) {
        hitTarget = true;
        terminal = true;
        break;
      }

      // B) Story requires choice to advance
      if (!story.canContinue && story.currentChoices.length > 0) {
        // A decision site is named to the route simulator by its address, as
        // the engine asks for a forced verdict; the top-level start, as the
        // story's `previousAddress` gives it, when no instruction has run yet.
        const site = previous ?? TOP_LEVEL_START;
        if (simulator.willForceChoice(site)) {
          const forcedSourcePath = simulator?.forceChoice(site);
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
          // Fork once and share the state with every sibling: they all fork
          // from this same position.
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
            // Already expanded from this exact position, so its children are
            // already queued.
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
            // Fork choice branch
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

      // C) If we can't continue and there are no choices, this is a dead end
      if (!story.canContinue) {
        terminal = true;
        break;
      }

      // D) Stay within starting knot?
      if (stayWithinKnot && exitedKnot(story, positions, fromKnotName, functions)) {
        terminal = true;
        break;
      }

      // Ask the engine to pause before evaluating conditions. The program
      // engine asks the simulator by the decision's own address, and runs on
      // through a forced one itself.
      story.pauseBeforeEvaluatingConditions = true;

      // One step was charged above. A Luau callback runs all of its steps
      // inside the step that called it, and those count too: the limit stops
      // them where the budget runs out, and what they took is charged after.
      const stepsBefore = story.stepCount;
      story.stepLimit = stepsBefore + 1 + budget.stepsRemaining;
      let stopped = false;
      try {
        story.ContinueAsync(); // this may hit a condition divert
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
        // The budget ran out part way through the step.
        budget.cut ??= "max-steps";
        terminal = true;
        break;
      }

      if (story.pausedBeforeCondition !== null) {
        // Pop the last encountered step,
        // because we're going to encounter it again on the next run
        stepsEncountered.pop();

        // Fork once and share the state with both branches: they fork from
        // this same position.
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
          // Already expanded from this exact position, so both branches are
          // already queued.
          terminal = true;
          break;
        }

        // The verdict the program reaches here, by which the route's report
        // tells a verdict the route forced (`departs`) from the program's own.
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
        // A pinned option's gate at its pinned offer is tried true first.
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
          // The verdict the story reaches unforced is searched first, so of
          // two routes the search can find at the same depth it finds the one
          // the story runs, and a beat a false condition skips is not shown
          // on the way (#1606).
          const natural = story.pausedJumpValue;
          for (const value of natural === false ? [false, true] : [true, false]) {
            branches.push(forkVerdict(value));
          }
        }
        break;
      }

      // else: keep looping to advance further toward target/branch
    }
  } finally {
    // Restore hooks
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

const makeStartNode = (
  story: Story,
  from: string,
  port: StatePort,
): FallbackNode => {
  // Start from fresh state, and jump to the knot start.
  //
  // A story that was reset and has not run since is already in that fresh
  // state, and resetting it again would re-evaluate every global definition in
  // the program — the seeded builtins included — to arrive back where it
  // already is. That is the ordinary case here: the search runs on a story the
  // compile constructed and reset moments earlier. Any story that has been
  // advanced, diverted, loaded into or written over reports itself as no longer
  // pristine, so the reset still happens wherever it means something.
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

/**
 * The search node a resume point stands for.
 *
 * Nothing is done to the story here. A node's state is restored from its own
 * `state` when it runs, so unlike {@link makeStartNode} this neither resets
 * the story nor moves it.
 *
 * The decisions are handed on as the node's queued overrides in full, exactly as
 * a node reached by walking would carry them: the story does not revisit the
 * sites they name, so they sit unconsumed, and dropping them would change what
 * happens if it ever did.
 */
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
  // A story that stands nowhere is in the top-level content's flow, `"0"`.
  // Read first, since a step that stays in its scene is the common case.
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
  state: SearchState,
  parent: FallbackNode,
  stepsEncountered: RouteStep[],
  ov: ChoiceOverride,
  choice: RouteChoice,
): FallbackNode => {
  return {
    state,
    // See forkCondition: the parent's identity, never a fresh chain.
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
