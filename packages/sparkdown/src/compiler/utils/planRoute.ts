import type { Simulator,SimulatorSnapshot } from "../../runtime/Simulator";
import { ErrorType } from "../../runtime/Error";
import type { ProgramStory as Story } from "../../program/ProgramStory";
import { StepLimitExceeded } from "../../runtime/StoryException";
import { imageDigest, type ProgramImage } from "../../program/ProgramImages";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { chunkOfAddress } from "../../program/ProgramChunk";
import { TOP_LEVEL_START, type ProgramAddress } from "../types/ProgramAddress";

export interface RoutePlan {
  /** The flow the route starts at the top of: a scene's name, or `"0"` for
   *  the top-level content. */
  from: string;
  /** The address the route ends at (`ProgramLocator.addressAt`). */
  to: ProgramAddress;
  /** The sequence of steps that led here */
  steps: RouteStep[];
  /** The decisions in the order you'll make them along the route. */
  decisions: RouteOverride[];
  /** The conditions in the order you'll encounter them along the route */
  conditions: { selected: boolean }[];
  /** The choices in the order you'll encounter them along the route */
  choices: { options: string[]; selected: number }[];
}

/** The state a search node runs from: an image of the program engine's
 *  state (docs/engine/binary-program.md, section 7), or the state as
 *  `story.state.toJson()` writes it. */
export type SearchState = string | ProgramImage;

export interface SearchNode {
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
  choices: { options: string[]; selected: number }[];
  /** The decision this node was forked to make, which its first step takes.
   *  Every earlier decision is already part of `state`, and the replay forces
   *  them all from the top in order (`decisions`): forcing one again here
   *  would apply it to a later visit of its site, as a loop's test makes. */
  overrides: RouteOverride[];
}

/**
 * The share of the step and node ceilings ({@link SearchOptions.maxSteps},
 * {@link SearchOptions.maxNodes}) the first phase of a search may spend once
 * it has met a condition (see {@link planRoute}). The share is of work, not
 * of time, so where it runs out does not depend on how busy the machine is,
 * and a resumed search and a search from the top cut a loop on the same pass.
 *
 * The first phase follows the program's own verdicts, and a line the program
 * reaches is found there within the work it takes the program to get there:
 * the largest real project's longest scene (8,325 lines) takes about 300,000
 * advances, under a quarter of {@link DEFAULT_MAX_STEPS}. A finite search
 * cannot tell a loop the program leaves after more work than this from one it
 * never leaves, so the second phase takes over where the share ran out, and a
 * route through a loop that outlasts it leaves the loop at the pass the share
 * ran out on. The share is also what a loop the program never leaves costs a
 * preview before the second phase starts.
 */
export const FIRST_PHASE_SHARE = 0.25;

/**
 * Extend a step-sequence identity with one more path: a step's address, or a
 * string a search keys a fork by (a state's text, an override's site).
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
 * Two 32-bit lanes (cyrb53-style) give ~2^64 distinct values, so across the
 * tens of thousands of steps a route can hold, two histories colliding is
 * vanishingly unlikely — and `Game.getCheckpoint` corroborates a match against
 * the step's own address, so even a collision costs a re-simulation rather
 * than resuming from an unrelated position.
 *
 * The value is meaningful only WITHIN one session's plans: it is compared
 * between an earlier plan and a re-plan (which is how checkpoint reuse works),
 * never persisted or parsed.
 */
export const extendSeq = (
  seq: string,
  path: ProgramAddress | string,
): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  // The characters of `seq`, a separator, then the characters of `path` — the
  // same sequence a joined string would give, without allocating one per step.
  // Written as one loop over the three pieces rather than a helper, because a
  // helper is a closure allocated on every one of the tens of thousands of
  // calls a deep search makes.
  for (let piece = seq ? 0 : 2; piece < 3; piece += 1) {
    if (piece === 2 && typeof path === "number") {
      // An address (docs/engine/binary-program.md, section 8) is folded as
      // its two 32-bit halves: a fold of the number with no string made for
      // it.
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
  // The two lanes whole, as four UTF-16 code units: a string of four
  // characters costs a fraction of a number's text in any radix, and a
  // search makes one per step.
  return String.fromCharCode(h1 & 0xffff, h1 >>> 16, h2 & 0xffff, h2 >>> 16);
};

export type RouteOverride = ConditionOverride | ChoiceOverride;

export interface RouteStep {
  /** Opaque identity of the sequence of addresses taken to reach this step.
   *  Two steps carry the same `seq` exactly when the same addresses led to
   *  them, which is what lets a re-plan reuse an earlier plan's checkpoints
   *  (`Game.getCheckpoint`). Not parseable — see {@link extendSeq}. */
  seq: string;
  /** The address of the position the step stands at: the address of the
   *  instruction that ran last, which survives a compile for every statement
   *  that was not emitted again. */
  address: ProgramAddress;
  /** The index of the latest decision made so far */
  decision: number;
  /** The index of the latest checkpoint made so far */
  checkpoint?: number;
}

/**
 * Where a search starts when it starts part-way along a route it already has.
 *
 * Everything here is what a node built by walking there would have held, so a
 * search resumed from one produces a plan indistinguishable from a search that
 * walked the whole way: the same step identities, so an earlier plan's
 * checkpoints still match, and the same decision history, so the simulator
 * behind it still forces what it forced.
 */
export interface RouteResumePoint {
  /** Story state at that step: as `story.state.toJson()` writes it, or an
   *  image of the program engine's state. */
  state: SearchState;
  /** The route's steps up to but not including that step: a resumed search
   *  reads the position it is standing on before advancing, so recording that
   *  step here as well would put it into the plan twice. */
  steps: RouteStep[];
  /** Every decision taken to get there, in order. */
  decisions: RouteOverride[];
  /** Those decisions split the way a plan reports them. */
  conditions: { selected: boolean }[];
  choices: { options: string[]; selected: number }[];
}

export interface ConditionOverride {
  kind: "condition";
  /** The address of the decision the verdict is for. */
  site: ProgramAddress;
  value: boolean;
  /** Set when the verdict is not the one the program reaches there: the
   *  route forced it to reach its target. */
  departs?: true;
}

/** How many of `route`'s steps come before its first departing verdict
 *  ({@link ConditionOverride.departs}): all of them when it has none. A step
 *  records the index of the latest decision taken before it. */
export const stepsBeforeDeparture = (route: RoutePlan): number => {
  const first = route.decisions.findIndex(
    (d) => d.kind === "condition" && d.departs,
  );
  if (first < 0) {
    return route.steps.length;
  }
  const at = route.steps.findIndex((step) => step.decision >= first);
  return at < 0 ? route.steps.length : at;
};

export interface ChoiceOverride {
  kind: "choice";
  /** The address of the decision the choice is taken at. */
  site: ProgramAddress;
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
   * If provided, these condition values are tried first in the second phase of
   * a search, matched to the decisions in the order the route meets them (see
   * {@link planRoute}); the first phase takes the program's own verdicts.
   */
  favoredConditions?: (boolean | undefined)[];

  /**
   * Set by a caller that loads a saved state or resets the story itself before
   * it runs the story again, which lets a search that found a route leave the
   * state where it stopped instead of resetting it.
   *
   * Resetting re-evaluates every global definition in the program, builtins
   * included, and the caller's own load or reset replaces that state
   * immediately — so on a found route the reset is work whose result nothing
   * reads. A search that found nothing still resets whatever the caller says,
   * because there the search's own position is the last thing that happened to
   * the story.
   *
   * What the caller gets back on a found route is the story parked where the
   * search stopped, with any open line already cancelled, so `ResetState` or a
   * state load can run on it immediately.
   */
  callerResetsStory?: boolean;

  /**
   * Start the search part-way along a route already taken rather than at the
   * top of `from`.
   *
   * The story ahead of a resume point is the story that was already searched
   * and replayed, so searching it again finds the same thing at the cost of
   * every step in it — which on a long scene is the whole cost. A caller that
   * can show the earlier part of a route is still valid hands the position back
   * instead, and the search picks up from there.
   *
   * It narrows the search as well as shortening it: only the branches reachable
   * from that position are explored, so a target that is only reachable by
   * deciding differently earlier is NOT found. A caller that wants the full
   * answer searches again without this when a resumed search comes back empty.
   *
   * A resumed search charges its first phase's share (see {@link planRoute})
   * for the part of the route it starts past: its steps and decisions, and a
   * node for each choice. When that share runs out, it comes back empty and
   * leaves the answer to a search from the top, so that a loop the share
   * cuts is cut on the same pass either way.
   */
  resumeFrom?: RouteResumePoint;

  /**
   * Whether a story that keeps images of its state (the program engine,
   * `ProgramStory.capture`) forks and restores them, in place of a JSON
   * round trip of the whole state at every fork and node (default true).
   * A fork's image is a delta on the image its run started from, and the
   * fork site is claimed by the digest of the state it holds
   * (`imageDigest`). Set false to search on the JSON round trip, which
   * the tests and the bench compare it with.
   */
  stateImages?: boolean;
}

/** Where a story stands, as a search reads it: the position each step is
 *  known by, and the flow the story runs in and those it will come back to,
 *  which keep a search within its scene. */
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

/**
 * Which ceiling stopped a search.
 *
 * Kept apart rather than folded into one "gave up" flag because the three are
 * not equally meaningful. `max-steps` and `max-nodes` are the deterministic
 * ceilings a test can drive and reproduce; `timeout` is the wall-clock
 * backstop, which is machine-dependent and should be vanishingly rare, so a
 * search reported as stopping on it is a signal that a step cost far more than
 * any measured step.
 */
export type SearchCutReason = "max-steps" | "max-nodes" | "timeout";

/**
 * How a search ended: it found the route, a ceiling cut it short, it broke, or
 * it ran the story out without ever reaching the target.
 *
 * The distinction is the whole point — "I gave up", "I broke" and "there is no
 * way there" are different answers for the author, and only the caller can
 * phrase them.
 *
 * `"exhausted"` is the only one of these that is a claim about the STORY rather
 * than about the search, so it is also the only one that can be wrong in a way
 * the author would act on. It is therefore reported only when the search really
 * did look everywhere: a run that threw is `"errored"`, because a search that
 * broke part way through knows nothing about the branches it never reached.
 */
export type SearchEndReason =
  | "found"
  | SearchCutReason
  | "errored"
  | "exhausted";

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

/** The first phase of a search (see {@link planRoute}). */
interface FirstPhase {
  /** Whether it has met a condition, after which its share binds. */
  sawCondition: boolean;
  /** The budget's `stepsRemaining` at which its share is spent. */
  stepsFloor: number;
  /** The budget's `nodesRemaining` at which its share is spent. */
  nodesFloor: number;
  /** The verdict the program does not reach at each condition the phase
   *  took, in the order it took them: a child forked there to force it,
   *  built when the second phase takes it up. */
  notTaken: { site: ProgramAddress; node: () => SearchNode }[];
  /** Where the run the share ran out in stood, as a node the second phase
   *  takes up. */
  cutAt: SearchNode | null;
  /** Whether the share ran out before the phase ran the story out. */
  spent: boolean;
}

/** The second phase's queue, taking up where the first stopped (see
 *  {@link planRoute}): the latest verdict the first did not take at each
 *  site, latest first, then the run the share cut, then the nodes it did not
 *  expand, then its other verdicts not taken, latest first. The verdicts not
 *  taken come before the run the share cut, which may have to run a long
 *  step again from the condition before it. */
const secondPhaseQueue = (
  phase: FirstPhase,
  unexpanded: SearchNode[],
): (SearchNode | (() => SearchNode))[] => {
  const latest: (() => SearchNode)[] = [];
  const earlier: (() => SearchNode)[] = [];
  const sites = new Set<ProgramAddress>();
  for (let i = phase.notTaken.length - 1; i >= 0; i -= 1) {
    const { site, node } = phase.notTaken[i]!;
    (sites.has(site) ? earlier : latest).push(node);
    sites.add(site);
  }
  return [
    ...latest,
    ...(phase.cutAt ? [phase.cutAt] : []),
    ...unexpanded,
    ...earlier,
  ];
};

/** Whether the first phase has spent its share of the ceilings, which it
 *  records: never in the second phase (`null`), and not before the first has
 *  met a condition. */
const firstPhaseSpent = (
  phase: FirstPhase | null,
  budget: SearchBudget,
): boolean => {
  if (
    !!phase &&
    phase.sawCondition &&
    (budget.stepsRemaining <= phase.stepsFloor ||
      budget.nodesRemaining <= phase.nodesFloor)
  ) {
    phase.spent = true;
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
 * Claim a fork site for expansion, returning false if an equivalent one has
 * already been expanded.
 *
 * What happens after a fork site is decided by the story state there and
 * nothing else: a node forces only the decision it was forked to make, which
 * its first step consumes ({@link SearchNode.overrides}), so no forced
 * decision is still queued at a fork. A second arrival at the same site and
 * state would enqueue the same children the first arrival already did, and
 * expanding it again is wasted work. A condition the first phase takes counts
 * as expanded, since it keeps the verdict it did not take for the second
 * ({@link FirstPhase.notTaken}), so the claims carry from one phase to the
 * next. Both phases are breadth first, so the arrival kept is also the
 * shortest route to that position the phase that kept it had.
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
 * Note that siblings of one fork share their state — they differ only in the
 * decision each is about to make, which the simulator applies while the child
 * runs. That is why the check belongs at the site being expanded and not on
 * the nodes coming off the queue: applied to nodes, it would collapse every
 * branch of the story into whichever sibling happened to be dequeued first.
 */
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
  /** True when a ceiling stopped the search, false when it ran out of story.
   *  The coarse form of {@link SearchEndReason}; both are set from the same
   *  place so they cannot disagree. */
  exhaustedBudget: boolean;
  /** How the search ended, in full: which ceiling cut it, or that it ran the
   *  story out, or that it found the route. This is what lets a caller tell an
   *  author "I gave up looking" apart from "there is no way to this line". */
  endReason: SearchEndReason;
  /** The runtime errors that ended the search's runs, once each, in the order
   *  they were raised. An error ends the story, so a search that found no
   *  route and raised one was stopped by it on the way; warnings end nothing
   *  and are not kept. Each names the address of the step that raised it,
   *  which `ProgramLocator.locationOf` places. */
  errors: SearchError[];
} = {
  nodesExpanded: 0,
  stepsUsed: 0,
  forkSitesSkipped: 0,
  exhaustedBudget: false,
  endReason: "exhausted",
  errors: [],
};

/** A runtime error that ended one of a search's runs. */
export interface SearchError {
  message: string;
  /** The address of the step that raised it, or nothing when no step had
   *  run. */
  address: ProgramAddress | null;
}

/**
 * Search for a way from the top of the flow `from` to the address `to`, by
 * stepping the story and forking it at its decisions. A step is known by the
 * address of the position it stands at (docs/engine/binary-program.md,
 * section 8), folded into a running identity (`extendSeq`).
 *
 * The search runs in two phases, both breadth first.
 *
 * The first follows the program: at every condition it takes the verdict the
 * program reaches there (`pausedConditionValue`) and forks only at choices,
 * which the program leaves to the player. A route it finds runs what the
 * program runs, so the line is replayed with the state the game reaches it
 * with: a loop runs its passes, a `break` leaves where the program leaves, and
 * a branch is taken as the program takes it (#637). At each condition it takes
 * it also keeps a child forked there to force the other verdict, for the
 * second phase.
 *
 * The second runs only when the first finds no way there: the line is inside a
 * branch the program skips, or the first phase spent its share of the ceilings
 * ({@link FIRST_PHASE_SHARE}). It takes up where the first stopped, re-running
 * none of its work: from the run the share cut, the verdicts the first did not
 * take and the nodes it did not expand ({@link secondPhaseQueue}). It forks at
 * every condition as well, trying the favored verdict, or else true, first,
 * and records each verdict a route forces against the program (`departs`).
 *
 * One exception: a step the share stops part way through, a Luau callback,
 * leaves no state to take up, and the second phase runs that run again from
 * the last condition it took.
 */
export const planRoute = (
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
  const favoredConditionalValues = options?.favoredConditions ?? [];
  const favoredChoiceIndices = options?.favoredChoices ?? [];
  const fromKnotName = from.split(".")[0] || "0";
  const positions = storyPositions(story);

  let routePlan: RoutePlan | null = null;
  /** Set when a node run threw (see the catch in the search loop). */
  let nodeErrored = false;
  const startingSteps = budget.stepsRemaining;
  const startingNodes = budget.nodesRemaining;

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
    const start = options?.resumeFrom
      ? makeResumeNode(options.resumeFrom)
      : makeStartNode(story, from, port);

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

    // The first phase's share of the ceilings, which binds once it has met a
    // condition: before that, the second phase would walk the same path. A
    // resumed search is charged for the route it starts past, as a search
    // from the top would have spent it.
    const resume = options?.resumeFrom;
    const firstPhase: FirstPhase = {
      sawCondition: !!resume?.conditions.length,
      stepsFloor:
        startingSteps -
        Math.floor(startingSteps * FIRST_PHASE_SHARE) +
        (resume ? resume.steps.length + resume.decisions.length : 0),
      nodesFloor:
        startingNodes -
        Math.floor(startingNodes * FIRST_PHASE_SHARE) +
        (resume?.choices.length ?? 0),
      notTaken: [],
      cutAt: null,
      spent: false,
    };
    let queue: (SearchNode | (() => SearchNode) | undefined)[] = [start];
    let head = 0;
    for (const phase of [firstPhase, null]) {
      if (routePlan || budget.cut) {
        break;
      }
      if (!phase) {
        if (!firstPhase.sawCondition || (resume && firstPhase.spent)) {
          // The second phase forks only where the first met a condition. A
          // resumed search whose share ran out leaves the rest to a search
          // from the top, whose share runs out where the cut lands.
          break;
        }
        queue = secondPhaseQueue(
          firstPhase,
          queue.slice(head).filter((n): n is SearchNode => !!n),
        );
        head = 0;
      }
      while (head < queue.length) {
        if (searchBudgetExhausted(budget) || firstPhaseSpent(phase, budget)) {
          break;
        }
        budget.nodesRemaining -= 1;
        lastSearchStats.nodesExpanded += 1;

        // Taken by index, and its slot cleared so a long queue does not
        // keep every node it has run.
        let entry: SearchNode | (() => SearchNode) | undefined;
        if (isBfs) {
          entry = queue[head];
          queue[head] = undefined;
          head += 1;
        } else {
          entry = queue.pop();
        }
        const node = typeof entry === "function" ? entry() : entry!;
        try {
          const result = runUntilDecisionOrBranch(
            story,
            port,
            node,
            positions,
            fromKnotName,
            to,
            favoredChoiceIndices,
            favoredConditionalValues,
            options?.stayWithinKnot !== false,
            options?.functions || [],
            budget,
            phase,
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
          // Swallowed so one bad node cannot abort a search that other
          // branches might still complete — but remembered, because it means
          // this search no longer covers the whole story and must not claim
          // that it does.
          nodeErrored = true;
        }
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
  node: SearchNode,
  positions: StoryPositions,
  fromKnotName: string,
  target: ProgramAddress | null, // set null for "enumerate all"
  favoredChoiceIndices: (number | undefined)[],
  favoredConditionalValues: (boolean | undefined)[],
  stayWithinKnot: boolean,
  functions: string[],
  budget: SearchBudget,
  firstPhase: FirstPhase | null,
): RunResult => {
  // 1) Restore snapshot
  port.restore(node.state);
  story.state.ResetErrors();
  // No step of this node has run, so none has ended the story.
  story.endedAt = null;

  const prevPauseBeforeEvaluatingConditions =
    story.pauseBeforeEvaluatingConditions;
  const prevSimulator = story.simulator;

  // A simulator that forces the decision this node was forked to make, and
  // in the first phase each verdict the program reaches as the run meets it.
  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  // The node as it stands: the first phase takes conditions without forking,
  // so the run adds to its decisions, and every child forks from them.
  const here: SearchNode = {
    ...node,
    decisions: [...node.decisions],
    conditions: [...node.conditions],
  };

  const branches: SearchNode[] = [];
  let hitTarget = false;
  let terminal = false;

  let seq = node.seq;
  const stepsEncountered: RouteStep[] = [];

  /** A node standing where this run stood after its first `steps` steps and
   *  `decisions` of its decisions (`conditions` of them conditions), which
   *  forces `overrides` next, and is forked to make `add` when given. Built
   *  from the run's own records, which only grow past those counts. */
  const nodeAt = (
    state: SearchState,
    steps: number,
    decisions: number,
    conditions: number,
    overrides: RouteOverride[],
    add?: ConditionOverride,
  ): SearchNode => {
    const taken = stepsEncountered.slice(0, steps);
    const madeDecisions = here.decisions.slice(0, decisions);
    const madeConditions = here.conditions.slice(0, conditions);
    if (add) {
      madeDecisions.push(add);
      madeConditions.push({ selected: add.value });
    }
    return {
      state,
      seq: taken.at(-1)?.seq ?? node.seq,
      steps: [...node.steps, ...taken],
      decisions: madeDecisions,
      conditions: madeConditions,
      choices: here.choices,
      overrides,
    };
  };
  // What the run forces next, which the first step after a fork or a
  // condition the first phase takes consumes.
  let pending = node.overrides;
  // The last position the run forked at, from which the second phase takes
  // it up when the first phase's share runs out part way through a step.
  let lastFork = {
    state: node.state,
    steps: 0,
    overrides: node.overrides,
    decisions: node.decisions.length,
    conditions: node.conditions.length,
  };

  try {
    // Tight loop: advance until target or branch site
    while (true) {
      if (stepBudgetExhausted(budget)) {
        terminal = true;
        break;
      }
      if (firstPhaseSpent(firstPhase, budget)) {
        // The second phase takes the run up from here.
        firstPhase!.cutAt = nodeAt(
          port.fork().state,
          stepsEncountered.length,
          here.decisions.length,
          here.conditions.length,
          pending,
        );
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
            decision: here.decisions.length - 1,
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
          if (!claimForkSite(budget, site, fork.key)) {
            // Already expanded from this exact position, so its children are
            // already queued.
            terminal = true;
            break;
          }
          const options = story.currentChoices.map((c) => c.text);
          const favoredChoiceIndex = favoredChoiceIndices[here.choices.length];
          if (favoredChoiceIndex != null) {
            const choice = story.currentChoices[favoredChoiceIndex]!;
            if (choice) {
              // Fork choice branch
              branches.push(
                forkChoice(
                  forkState,
                  here,
                  stepsEncountered,
                  {
                    kind: "choice",
                    site,
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
                forkState,
                here,
                stepsEncountered,
                {
                  kind: "choice",
                  site,
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
      // them where the budget runs out, or the first phase's share once it
      // binds, and what they took is charged after.
      const stepsBefore = story.stepCount;
      const allowed = firstPhase?.sawCondition
        ? Math.max(0, budget.stepsRemaining - firstPhase.stepsFloor)
        : budget.stepsRemaining;
      story.stepLimit = stepsBefore + 1 + allowed;
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
        // The budget, or the first phase's share of it, ran out part way
        // through the step. Only the budget's own end cuts the search: the
        // second phase has the rest of it, from the last fork, since a step
        // stopped part way leaves no state to take up.
        if (budget.stepsRemaining <= 0) {
          budget.cut ??= "max-steps";
        } else if (firstPhase) {
          firstPhase.spent = true;
          firstPhase.cutAt = nodeAt(
            lastFork.state,
            lastFork.steps,
            lastFork.decisions,
            lastFork.conditions,
            lastFork.overrides,
          );
        }
        terminal = true;
        break;
      }
      pending = [];

      if (story.pausedBeforeCondition !== null) {
        const site = story.pausedBeforeCondition;
        const natural = story.pausedConditionValue;
        // Pop the last encountered step,
        // because we're going to encounter it again on the next run
        stepsEncountered.pop();
        seq = stepsEncountered.at(-1)?.seq ?? here.seq;

        // The state here, which both branches of a fork share, and by which
        // the first phase knows a loop that came back to where it was.
        const fork = port.fork();
        if (!claimForkSite(budget, site, fork.key)) {
          // Already expanded from this exact position, so both branches are
          // already queued, or the program's own way has been here before.
          terminal = true;
          break;
        }

        if (firstPhase && natural !== null) {
          // Take the program's verdict and run on: it is recorded as a
          // forked child would record it, and the step popped above is met
          // again after it. The other verdict is kept, forked here, for the
          // second phase.
          firstPhase.sawCondition = true;
          const steps = stepsEncountered.length;
          const decisions = here.decisions.length;
          const conditions = here.conditions.length;
          const other: ConditionOverride = {
            kind: "condition",
            site,
            value: !natural,
            departs: true,
          };
          firstPhase.notTaken.push({
            site,
            node: () =>
              nodeAt(fork.state, steps, decisions, conditions, [other], other),
          });
          const ov: ConditionOverride = { kind: "condition", site, value: natural };
          here.decisions.push(ov);
          here.conditions.push({ selected: natural });
          simulator.add(ov);
          pending = [ov];
          lastFork = {
            state: fork.state,
            steps,
            overrides: pending,
            decisions: here.decisions.length,
            conditions: here.conditions.length,
          };
          continue;
        }

        // Both verdicts: the favored one first, or else the one the program
        // reaches, or else true. Of two routes the search can find at the
        // same depth it then finds the one the story runs, and a beat a false
        // condition skips is not shown on the way (#1606). A verdict the
        // program does not reach here is recorded as one the route forces.
        const first =
          favoredConditionalValues[here.conditions.length] ?? natural ?? true;
        for (const value of [first, !first]) {
          const departs = natural !== null && value !== natural;
          branches.push(
            forkCondition(fork.state, here, stepsEncountered, {
              kind: "condition",
              site,
              value,
              ...(departs ? { departs: true as const } : {}),
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
  }

  return {
    hitTarget,
    branches,
    steps: [...node.steps, ...stepsEncountered],
    decisions: here.decisions,
    conditions: here.conditions,
    choices: here.choices,
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
): SearchNode => {
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
 * The node forces nothing: every decision of the resume point was taken
 * before the state it stands in.
 */
const makeResumeNode = (resumeFrom: RouteResumePoint): SearchNode => ({
  state: resumeFrom.state,
  seq: resumeFrom.steps.at(-1)?.seq ?? "",
  steps: [...resumeFrom.steps],
  decisions: [...resumeFrom.decisions],
  conditions: [...resumeFrom.conditions],
  choices: [...resumeFrom.choices],
  overrides: [],
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
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ConditionOverride,
): SearchNode => {
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
    overrides: [ov],
  };
};

const forkChoice = (
  state: SearchState,
  parent: SearchNode,
  stepsEncountered: RouteStep[],
  ov: ChoiceOverride,
  choice: { options: string[]; selected: number },
): SearchNode => {
  return {
    state,
    // See forkCondition: the parent's identity, never a fresh chain.
    seq: stepsEncountered.at(-1)?.seq ?? parent.seq,
    steps: [...parent.steps, ...stepsEncountered],
    decisions: [...parent.decisions, ov],
    conditions: [...parent.conditions],
    choices: [...parent.choices, choice],
    overrides: [ov],
  };
};

/** A route simulator that can take another decision while it runs. */
export interface RouteSimulator extends Simulator {
  /** Force `override` too, after every decision already queued at its site. */
  add(override: RouteOverride): void;
}

export const buildRouteSimulator = (
  decisions: RouteOverride[],
  fromDecision = 0,
): RouteSimulator => {
  const condQueues = new Map<ProgramAddress, boolean[]>();
  const conditionPointers = new Map<ProgramAddress, number>();
  const choiceQueues = new Map<ProgramAddress, string[]>();
  const choicePointers = new Map<ProgramAddress, number>();

  // Only enqueue overrides starting at `fromDecision`
  const pending = fromDecision > 0 ? decisions.slice(fromDecision) : decisions;

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

  // group into queues in-order
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
  };
};

const now = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

const NOOP = () => {};

/**
 * Whether the story, run on from where it stands, shows something (text, a
 * display instruction or a menu) before it ends. A run that ends, or that a
 * runtime error ends, first shows nothing, and so does one that runs past
 * `maxSteps`. Conditions are evaluated as the story evaluates them, with no
 * decision forced.
 *
 * The story runs as a search runs it: under silent hooks, keeping no beat
 * images. It is left where the run stopped, so the caller replaces its state
 * before anything else reads it.
 */
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
    // The step limit, or a failure the engine does not report as a runtime
    // error: either way the run showed nothing.
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
