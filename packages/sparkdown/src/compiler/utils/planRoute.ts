import type { Simulator,SimulatorSnapshot } from "../../runtime/Simulator";
import { ErrorType } from "../../runtime/Error";
import type { ProgramStory as Story } from "../../program/ProgramStory";
import { StepLimitExceeded } from "../../runtime/StoryException";
import { imageDigest, type ProgramImage } from "../../program/ProgramImages";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { chunkOfAddress } from "../../program/ProgramChunk";
import { TOP_LEVEL_START, type ProgramAddress } from "../types/ProgramAddress";
import { planRouteFallback } from "./planRouteFallback";

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
  /** The work the search had spent when level zero's bound began, at the
   *  first condition it met, and the work at which that bound ran out
   *  (see {@link planRoute}); absent when it met none. A search resumed past
   *  that condition is charged the same bound ({@link RouteCharge}). */
  levelZero?: LevelZeroBound;
  /** Set on a route origin/main's search found, because the search that
   *  follows the program found none within its budget (see
   *  {@link planRoute}). Its values are the ones origin/main's preview shows,
   *  and no search resumes from it. */
  fallback?: true;
}

/** Where level zero's work bound began and where it runs out, as work the
 *  search had spent: its steps and its nodes. */
export interface LevelZeroBound {
  /** The steps spent when level zero met its first condition. */
  startSteps: number;
  /** The steps spent at which its bound runs out. */
  steps: number;
  /** The nodes expanded at which its bound runs out. */
  nodes: number;
}

/** The state a search node runs from: an image of the program engine's
 *  state (docs/engine/binary-program.md, section 7), or the state as
 *  `story.state.toJson()` writes it. */
export type SearchState = string | ProgramImage;

/**
 * A sequence a node shares with the nodes forked from it: everything in
 * `prev`, then the first `count` items of `items`. Extending one copies
 * nothing, so a node costs the same however long the route to it; the
 * route's own arrays are built once, for the route the search finds.
 */
interface Trail<T> {
  readonly prev: Trail<T> | null;
  readonly items: readonly T[];
  readonly count: number;
  readonly length: number;
}

/** `prev` followed by the first `count` of `items`, which must not change
 *  below `count` afterwards. */
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
  /** The state the node runs from, which siblings share. */
  state: SearchState;
  /** Opaque identity of the sequence of addresses taken to reach this step
   *  (see {@link extendSeq}) */
  seq: string;
  /** The sequence of steps that led here */
  steps: Trail<RouteStep> | null;
  /** The sequence of decisions that led here */
  decisions: Trail<RouteOverride> | null;
  /** The sequence of conditions that led here */
  conditions: Trail<{ selected: boolean }> | null;
  /** The sequence of choices that led here */
  choices: Trail<{ options: string[]; selected: number }> | null;
  /** The decision this node was forked to make, which its first step takes.
   *  Every earlier decision is already part of `state`, and the replay forces
   *  them all from the top in order (`decisions`): forcing one again here
   *  would apply it to a later visit of its site, as a loop's test makes. */
  overrides: RouteOverride[];
  /** How many verdicts the route to here forces against the program: the
   *  level of the search it belongs to (see {@link planRoute}). */
  forced: number;
  /** The work the route has followed since the latest of its last beat,
   *  the first condition after that beat and its last forced verdict, or -1
   *  before that condition (see {@link BEAT_WORK_CAP}). */
  beatWork: number;
  /** The route the node continues: a node that takes up a run where it
   *  stopped (a turn, or a run a bound cut) keeps its route's, and one
   *  forked to make a choice or a verdict starts a route of its own. A later
   *  visit to a condition site replaces the verdict an earlier one kept only
   *  within one route (`Level.notTaken`). */
  route: number;
}

/** A fresh route identity ({@link SearchNode.route}). */
let lastRoute = 0;
const newRoute = (): number => (lastRoute += 1);

/**
 * The work, in steps (Luau calls' included), a route may follow without a
 * beat (see {@link planRoute}), counted from the latest of its last beat, the
 * first condition after that beat and its last forced verdict. A run past it
 * goes no further, so a long loop with no beat in it is left at the pass
 * where this ran out, by forcing its exit there; forcing a verdict starts the
 * count again, so the forced route can go on to the line.
 *
 * The game takes a checkpoint at each beat, so a stretch with no beat gives
 * a replay nothing to resume from inside it, and a search resumed for a line
 * after it starts no later than the verdict that left it, so it runs the
 * stretch again on every scrub. Sized by preview-bench in the worker: a line
 * in a skipped branch after a loop of 5,000 or 60,000 passes with an `if` in
 * its body previews within about twice origin/main's time at this size, and
 * at 8,192 the search alone took 160 to 190 ms a scrub. Work before the
 * first condition is not counted: a route that forces nothing there runs it
 * as the program does, as a search that cut every loop at its first test
 * would too.
 */
export const BEAT_WORK_CAP = 2_048;

/**
 * The budget of the search that follows the program (see {@link planRoute}):
 * the nodes it may expand, the steps it may spend from the first condition it
 * meets (work before it, a long Luau call included, is the same work
 * origin/main's search does), and a wall-clock backstop. Past it, the route
 * is origin/main's search's.
 *
 * Steps and nodes are work, not time, and a resumed search is charged what
 * the search from the top recorded, so a resumed and a fresh search run out
 * of them at the same point. Sized by preview-bench: menu loops, where the
 * player's choices double the routes at every pass, and long loops with a
 * branch in them, before a line in a skipped branch, fall back within about
 * twice origin/main's preview time.
 */
export const FAITHFUL_NODES = 4_096;
export const FAITHFUL_STEPS = 100_000;
export const FAITHFUL_TIMEOUT = 5_000;

/**
 * The share of the step and node work remaining that each level of a search
 * may spend (see {@link planRoute}): level zero from the first condition it
 * meets, every later level from when it begins. The share is of work, not of
 * time, so where it runs out does not depend on how busy the machine is, and
 * a resumed search and a search from the top cut a loop on the same pass.
 *
 * Level zero follows the program's own verdicts, and a line the program
 * reaches is found there within the work it takes the program to get there:
 * the largest real project's longest scene (8,325 lines) takes about 300,000
 * advances, under a quarter of {@link DEFAULT_MAX_STEPS}. A finite search
 * cannot tell a loop the program leaves after more work than its level's
 * bound from one it never leaves, so the next level takes over where the
 * bound ran out, and a route through a loop that outlasts it leaves the loop
 * at the pass the bound ran out on. The bound is also what a loop the program
 * never leaves costs a preview before the next level starts.
 */
export const LEVEL_SHARE = 0.25;

/**
 * The steps a run may take before it goes back to the end of its level's
 * queue, to go on from where it stopped when its turn comes round again
 * (see {@link planRoute}). Without it the first run of a level that enters a
 * long loop spends the level's whole bound, and every route behind it waits
 * for the next level, where the same happens again.
 *
 * A turn ends when the search's spent steps pass a multiple of this, not a
 * count from the run's start, so a resumed search, charged what the search
 * from the top had spent, ends its turns at the same points.
 */
export const RUN_TURN_STEPS = 16_384;

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
  /** The steps the search had spent when it recorded the step, Luau
   *  callbacks' included, which a search resumed here is charged
   *  ({@link RouteCharge}). */
  spentSteps?: number;
  /** The nodes it had expanded then. */
  spentNodes?: number;
  /** The level of the search it was recorded in (see {@link planRoute}). */
  level?: number;
  /** The route's {@link SearchNode.beatWork} when it was recorded. */
  beatWork?: number;
}

/** What a search from the top had spent when it recorded the step a resumed
 *  search starts on, which the resumed search is charged so that it runs
 *  out of each bound where the search from the top would. */
export interface RouteCharge {
  /** The steps spent, Luau callbacks' included ({@link RouteStep.spentSteps}). */
  steps: number;
  /** The nodes expanded ({@link RouteStep.spentNodes}). */
  nodes: number;
  /** The route's work since its last beat ({@link RouteStep.beatWork}). */
  beatWork: number;
  /** Level zero's bound, when the search met its first condition before
   *  that step ({@link RoutePlan.levelZero}). */
  levelZero?: LevelZeroBound;
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
  /** What the search from the top had spent when it recorded that step, in
   *  level zero: a resumed search is charged it. */
  charge: RouteCharge;
}

/** What a search resumed on `route`'s step `at` (whose story stands on that
 *  step) is charged: what the search that planned the route had spent when it
 *  recorded the step. Nothing when it recorded none there or recorded the
 *  step past level zero, where a resumed search cannot stand where it stood:
 *  a search then starts from the top. */
export const routeChargeAt = (
  route: RoutePlan,
  at: number,
): RouteCharge | null => {
  const step = route.steps[at];
  if (
    step?.spentSteps == null ||
    step.spentNodes == null ||
    step.beatWork == null ||
    step.level !== 0
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
    beatWork: step.beatWork,
    ...(levelZero ? { levelZero } : {}),
  };
};

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
   * If provided, these condition values are tried first at a condition the
   * program leaves open (one whose condition is no value a decision can
   * test), matched to the decisions in the order the route meets them (see
   * {@link planRoute}); every other condition takes the program's own verdict
   * unless the route forces the other.
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
   * A resumed search starts charged with what the search from the top had
   * spent when it recorded the step resumed on ({@link RouteResumePoint.charge}),
   * so each bound (see {@link planRoute}) runs out where it ran out there.
   * When level zero's bound runs out, it comes back empty and leaves the
   * answer to a search from the top, so that a loop the bound cuts is cut on
   * the same pass either way.
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
  /** The ceilings those count down from. */
  maxSteps: number;
  maxNodes: number;
  /** Wall-clock backstop */
  deadlineTime: number;
  /** Which ceiling actually stopped something, recorded at the point it did;
   *  null while none has. The first one to fire is kept, because that is the
   *  one that stopped the work — a later check finding a second ceiling also
   *  spent is describing the same stop. */
  cut: SearchCutReason | null;
  /** Fork sites already expanded (see {@link claimForkSite}) */
  visited: Set<string>;
  /** The steps spent at which the search stops following the program
   *  ({@link FAITHFUL_STEPS}), set at level zero's first condition; null
   *  before it. */
  faithfulEnd: number | null;
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

/** The steps a search has spent, Luau callbacks' included. */
const spentSteps = (budget: SearchBudget): number =>
  budget.maxSteps - budget.stepsRemaining;

/** The nodes a search has expanded. */
const spentNodes = (budget: SearchBudget): number =>
  budget.maxNodes - budget.nodesRemaining;

/** A node waiting in a level's queue, or a child built when the level takes
 *  it up, which is nothing when a later visit to its site replaced it. */
type QueueEntry = SearchNode | (() => SearchNode | null);

/** A child forked at a condition to force the verdict the program does not
 *  reach there, built when its level takes it up. */
interface NotTaken {
  site: ProgramAddress;
  /** The route whose run forked it ({@link SearchNode.route}). */
  route: number;
  node: () => SearchNode;
}

/** What a kept verdict is kept by: the route that made it and its site. */
const notTakenKey = (notTaken: NotTaken): string =>
  `${notTaken.route}|${notTaken.site}`;

/** One level of a search: the routes that force a given number of verdicts
 *  (see {@link planRoute}). */
interface Level {
  /** How many verdicts its routes force. */
  index: number;
  /** The work spent at which its bound runs out, and the steps spent when
   *  the bound began; null until it binds (level zero, before its first
   *  condition). */
  bound: { startSteps: number; steps: number; nodes: number } | null;
  /** The verdict the program does not reach at the latest visit each route
   *  made to each condition site, for the next level, in the order of those
   *  visits ({@link notTakenKey}). One per route and site: a route's later
   *  visit to a site (a later pass of a loop it is in) reaches whatever
   *  forcing an earlier one would, and holding one per visit would hold a
   *  state image per pass of every loop. Visits by different routes hold
   *  different state, and are all kept. */
  notTaken: Map<string, NotTaken>;
  /** Where the run its bound ran out in stood, as a node the next level
   *  takes up. */
  cutAt: SearchNode | null;
  /** Whether its bound ran out before it ran out of routes. */
  spent: boolean;
}

const newLevel = (index: number): Level => ({
  index,
  bound: null,
  notTaken: new Map(),
  cutAt: null,
  spent: false,
});

/** Start `level`'s bound: a {@link LEVEL_SHARE} of the work remaining, and
 *  at least one step and one node. */
const bindLevel = (level: Level, budget: SearchBudget): void => {
  level.bound ??= {
    startSteps: spentSteps(budget),
    steps:
      spentSteps(budget) +
      Math.max(1, Math.floor(budget.stepsRemaining * LEVEL_SHARE)),
    nodes:
      spentNodes(budget) +
      Math.max(1, Math.floor(budget.nodesRemaining * LEVEL_SHARE)),
  };
};

/** The next level's queue, taking up where `level` stopped (see
 *  {@link planRoute}): the verdicts it did not take, the latest visit
 *  first, then the nodes it did not expand, then the run its bound cut. The
 *  run the bound cut has had its level's work already, so a loop the
 *  program never leaves is not run first at every level. */
const nextLevelQueue = (
  level: Level,
  unexpanded: QueueEntry[],
): QueueEntry[] => [
  ...[...level.notTaken.values()].reverse().map((notTaken) => notTaken.node),
  ...unexpanded,
  ...(level.cutAt ? [level.cutAt] : []),
];

/** Whether `level` has spent its bound, which it records. */
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
 * expanding it again is wasted work. A condition a run takes counts as
 * expanded, since it keeps the verdict it did not take for the next level
 * ({@link Level.notTaken}), so the claims carry from one level to the next.
 * Levels go in order and each is breadth first, so the arrival kept is also
 * the route to that position that forces fewest verdicts, and among those
 * the shortest the search had.
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
 * Every route follows the program except the verdicts it forces: at each
 * condition a run takes the verdict the program reaches there
 * (`pausedConditionValue`), and it forks only at choices, which the program
 * leaves to the player, and at a condition with no value a decision can test.
 * A route therefore runs what the program runs wherever it does not force, so
 * the line is replayed with the state the game reaches it with: a loop runs
 * its passes, a `break` leaves where the program leaves, and a branch is taken
 * as the program takes it, inside a forced branch as well (#637). At each
 * condition it takes, a run also keeps a child forked there to force the other
 * verdict, which it records as a departure (`departs`).
 *
 * Routes are searched in order of the number of verdicts they force, fewest
 * first: level zero forces none, and a child forcing one more verdict than its
 * route waits for the next level. Within a level the search is breadth first.
 * The order is by that count alone; no amount of work the program does trades
 * against a forced verdict.
 *
 * Each level may spend a {@link LEVEL_SHARE} of the work remaining, level zero
 * from the first condition it meets (work before it, a long Luau call
 * included, is not charged against the bound). A level that spends its bound
 * hands on where it stopped, re-running none of its work
 * ({@link nextLevelQueue}): the verdicts it did not take, the nodes it did not
 * expand and the run the bound cut. So a loop whose work, counted from that
 * point, outruns its level's bound is left at the pass the bound ran out on.
 *
 * One exception: a step a bound stops part way through, a Luau callback,
 * leaves no state to take up, and the next level runs that run again from the
 * last condition it took.
 */
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
  // The search that follows the program runs within its own budget, inside
  // the caller's ceilings (FAITHFUL_NODES, FAITHFUL_STEPS, FAITHFUL_TIMEOUT).
  const searchTimeout = Math.min(
    options?.searchTimeout ?? DEFAULT_SEARCH_TIMEOUT,
    FAITHFUL_TIMEOUT,
  );
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxNodes = Math.min(
    options?.maxNodes ?? DEFAULT_MAX_NODES,
    FAITHFUL_NODES,
  );
  // A resumed search starts charged with what the search from the top had
  // spent when it stood where this one starts, one step and one node short:
  // its first run charges them again as it records that step.
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
    faithfulEnd: charge?.levelZero
      ? charge.levelZero.startSteps + FAITHFUL_STEPS
      : null,
  };
  const favoredConditionalValues = options?.favoredConditions ?? [];
  const favoredChoiceIndices = options?.favoredChoices ?? [];
  const fromKnotName = from.split(".")[0] || "0";
  const positions = storyPositions(story);

  let routePlan: RoutePlan | null = null;
  /** Set when a node run threw (see the catch in the search loop). */
  let nodeErrored = false;
  const startingSteps = budget.stepsRemaining;

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

    // Level zero's bound begins at the first condition it meets: before
    // that, the next level would walk the same path. A search resumed past
    // that condition is given the bound the search from the top had.
    let level = newLevel(0);
    if (charge?.levelZero) {
      level.bound = { ...charge.levelZero };
    }
    const levelZero = level;
    let queue: (QueueEntry | undefined)[] = [start];
    let head = 0;
    // A child forcing one more verdict than the level running waits for the
    // next; one from a node handed on from an earlier level, forcing no more
    // than the level running, joins its queue. Either way only a route's
    // latest visit to a site is kept (`Level.notTaken`): the queue holds the
    // key, and an entry a later visit by the same route replaced is passed
    // over.
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
    while (true) {
      while (head < queue.length) {
        if (searchBudgetExhausted(budget) || levelSpent(level, budget)) {
          break;
        }

        // Taken by index, and its slot cleared so a long queue does not
        // keep every node it has run.
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
          // A verdict a later visit to its site replaced.
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
            favoredChoiceIndices,
            favoredConditionalValues,
            options?.stayWithinKnot !== false,
            options?.functions || [],
            budget,
            level,
            defer,
          );

          if (result.hitTarget) {
            routePlan = {
              from,
              to,
              steps: result.steps,
              decisions: result.decisions,
              conditions: result.conditions,
              choices: result.choices,
              ...(levelZero.bound ? { levelZero: { ...levelZero.bound } } : {}),
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
      if (routePlan || budget.cut) {
        break;
      }
      if (charge && level === levelZero && level.spent) {
        // A resumed search whose level zero ran out leaves the rest to a
        // search from the top, which runs out of it at the same point but
        // also holds the verdicts not taken before this one started.
        break;
      }
      // The level has stopped: it ran out of routes, or of its bound. The
      // next takes up where it stopped.
      const next = nextLevelQueue(
        level,
        queue.slice(head).filter((n): n is QueueEntry => !!n),
      );
      if (!next.length) {
        break;
      }
      level = newLevel(level.index + 1);
      bindLevel(level, budget);
      queue = next;
      head = 0;
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

/**
 * Search for a route from the top of the flow `from` to the address `to`.
 *
 * The search that follows the program runs first, within its own budget
 * ({@link FAITHFUL_NODES}, {@link FAITHFUL_STEPS}, {@link FAITHFUL_TIMEOUT};
 * see the search's own description above `planRouteFaithful`). When it finds
 * no route there, the route is origin/main's search's (`planRouteFallback`),
 * run with the caller's ceilings and charged nothing for what the first
 * spent, and is marked {@link RoutePlan.fallback}: a line origin/main's
 * preview reaches is always reached, with the values origin/main's route
 * gives where the program's own way was not found in time.
 *
 * A resumed search ({@link SearchOptions.resumeFrom}) never falls back: it
 * comes back empty, and the caller searches from the top, which falls back
 * if it must, so a resumed and a fresh preview take the same kind of route.
 */
export const planRoute = (
  story: Story,
  from: string,
  to: ProgramAddress,
  options?: SearchOptions,
): RoutePlan | null => {
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
  target: ProgramAddress | null, // set null for "enumerate all"
  favoredChoiceIndices: (number | undefined)[],
  favoredConditionalValues: (boolean | undefined)[],
  stayWithinKnot: boolean,
  functions: string[],
  budget: SearchBudget,
  level: Level,
  defer: (forced: number, notTaken: NotTaken) => void,
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
  // each verdict the program reaches as the run meets it.
  const simulator = buildRouteSimulator(node.overrides);
  story.simulator = simulator;

  // What the run adds to the node's route: a run takes conditions without
  // forking, so it adds decisions as well as steps, and every child forks
  // from them.
  const runDecisions: RouteOverride[] = [];
  const runConditions: { selected: boolean }[] = [];
  const decisionCount = () => trailLength(node.decisions) + runDecisions.length;
  const conditionCount = () =>
    trailLength(node.conditions) + runConditions.length;

  const branches: SearchNode[] = [];
  let hitTarget = false;
  let terminal = false;

  let seq = node.seq;
  const stepsEncountered: RouteStep[] = [];

  // The work followed since the route's last beat ({@link SearchNode.beatWork}).
  let beatWork = node.beatWork;
  const charge = (steps: number) => {
    budget.stepsRemaining -= steps;
    if (beatWork >= 0) {
      beatWork += steps;
    }
  };

  /** Where the run stands: how much of each of its records it has made. */
  type Mark = {
    steps: number;
    decisions: number;
    conditions: number;
    beatWork: number;
  };
  const mark = (): Mark => ({
    steps: stepsEncountered.length,
    decisions: runDecisions.length,
    conditions: runConditions.length,
    beatWork,
  });

  /** A node standing where this run stood at `at`, which forces
   *  `overrides` next, and is forked to make `add` (a condition's verdict, or
   *  a choice) when given. Built on the run's own records, which only grow
   *  past `at` afterwards. */
  const nodeAt = (
    state: SearchState,
    at: Mark,
    overrides: RouteOverride[],
    add?: RouteOverride,
    choice?: { options: string[]; selected: number },
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
      forced:
        node.forced + (add?.kind === "condition" && add.departs ? 1 : 0),
      // A forced verdict starts the count of work without a beat again.
      beatWork: add?.kind === "condition" && add.departs ? 0 : at.beatWork,
      // A node forked to make a choice or a verdict starts a route of its
      // own; one that takes the run up where it stopped continues it.
      route: add ? newRoute() : node.route,
    };
  };
  // What the run forces next, which the first step after a fork or a
  // condition the run takes consumes.
  let pending = node.overrides;
  // The step a condition the run takes put back, which the run then meets
  // again: it keeps what the search had spent when it first recorded it.
  let putBack: RouteStep | undefined;
  // Where the run's turn ends ({@link RUN_TURN_STEPS}).
  const turnEnd =
    (Math.floor(spentSteps(budget) / RUN_TURN_STEPS) + 1) * RUN_TURN_STEPS;
  // The last position the run forked at, from which the next level takes it
  // up when the level's bound runs out part way through a step.
  let lastFork = { state: node.state, at: mark(), overrides: node.overrides };

  try {
    // Tight loop: advance until target or branch site
    while (true) {
      if (stepBudgetExhausted(budget)) {
        terminal = true;
        break;
      }
      if (levelSpent(level, budget)) {
        // The next level takes the run up from here.
        level.cutAt = nodeAt(port.fork().state, mark(), pending);
        terminal = true;
        break;
      }
      if (beatWork >= BEAT_WORK_CAP) {
        // It has followed as much as a route follows without a beat: it goes
        // no further, and the verdicts it did not take lead on.
        terminal = true;
        break;
      }
      if (spentSteps(budget) >= turnEnd) {
        // Its turn is over: it goes back to the end of the queue, to go on
        // from here.
        branches.push(nodeAt(port.fork().state, mark(), pending));
        terminal = true;
        break;
      }
      charge(1);

      const previous = positions.previous();

      if (previous !== undefined) {
        if (
          stepsEncountered.length === 0 ||
          previous !== stepsEncountered.at(-1)?.address
        ) {
          seq = extendSeq(seq, previous);
          const again = putBack?.address === previous ? putBack : undefined;
          stepsEncountered.push({
            checkpoint: undefined,
            decision: decisionCount() - 1,
            address: previous,
            seq,
            spentSteps: again?.spentSteps ?? spentSteps(budget),
            spentNodes: again?.spentNodes ?? spentNodes(budget),
            level: level.index,
            beatWork: again?.beatWork ?? beatWork,
          });
        }
        putBack = undefined;
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
          const at = mark();
          const forkChoice = (selected: number) => {
            const ov: ChoiceOverride = {
              kind: "choice",
              site,
              value: story.currentChoices[selected]!.sourcePath,
            };
            return nodeAt(forkState, at, [ov], ov, { options, selected });
          };
          const favoredChoiceIndex =
            favoredChoiceIndices[trailLength(node.choices)];
          if (
            favoredChoiceIndex != null &&
            story.currentChoices[favoredChoiceIndex]
          ) {
            branches.push(forkChoice(favoredChoiceIndex));
          }
          for (let i = 0; i < story.currentChoices.length; i++) {
            if (i === favoredChoiceIndex) {
              // Skip forking favored choice since we already forked it earlier
              terminal = true;
              continue;
            }
            branches.push(forkChoice(i));
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
      // them where the budget runs out, or the level's bound once it binds,
      // or the route's work since its last beat, and what they took is
      // charged after.
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
      if (beatWork >= 0) {
        allowed = Math.min(allowed, BEAT_WORK_CAP - beatWork);
      }
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
        charge(Math.max(0, story.stepCount - stepsBefore - 1));
      }
      if (stopped) {
        // The budget, the level's bound or the route's work since its last
        // beat ran out part way through the step. Only the budget's own end
        // cuts the search. A level's bound hands the rest to the next level,
        // from the last fork, since a step stopped part way leaves no state
        // to take up; a route past its work since its last beat goes no
        // further.
        if (stepBudgetExhausted(budget)) {
          // The budget, or the search's own end (FAITHFUL_STEPS): its cut
          // is recorded there.
        } else if (levelSpent(level, budget)) {
          level.cutAt = nodeAt(lastFork.state, lastFork.at, lastFork.overrides);
        }
        terminal = true;
        break;
      }
      pending = [];
      if (story.asyncContinueComplete && story.continueShowedSomething) {
        // A beat, where the game takes a checkpoint a replay resumes from.
        beatWork = -1;
      }

      if (story.pausedBeforeCondition !== null) {
        const site = story.pausedBeforeCondition;
        const natural = story.pausedConditionValue;
        // Pop the last encountered step,
        // because we're going to encounter it again on the next run
        putBack = stepsEncountered.pop();
        seq = stepsEncountered.at(-1)?.seq ?? node.seq;

        // The state here, which both branches of a fork share, and by which
        // a run knows a loop that came back to where it was.
        const fork = port.fork();
        if (!claimForkSite(budget, site, fork.key)) {
          // Already expanded from this exact position, so both branches are
          // already queued, or the program's own way has been here before.
          terminal = true;
          break;
        }
        // The work a route follows since its last beat counts from here.
        if (beatWork < 0) {
          beatWork = 0;
        }

        if (natural !== null) {
          // Take the program's verdict and run on: it is recorded as a
          // forked child would record it, and the step popped above is met
          // again after it. The other verdict is kept, forked here, for the
          // level that forces one more verdict. Level zero's bound begins at
          // the first condition it meets.
          if (level.index === 0) {
            bindLevel(level, budget);
            budget.faithfulEnd ??= level.bound!.startSteps + FAITHFUL_STEPS;
          }
          const at = mark();
          const other: ConditionOverride = {
            kind: "condition",
            site,
            value: !natural,
            departs: true,
          };
          defer(node.forced + 1, {
            site,
            route: node.route,
            node: () => nodeAt(fork.state, at, [other], other),
          });
          const ov: ConditionOverride = { kind: "condition", site, value: natural };
          runDecisions.push(ov);
          runConditions.push({ selected: natural });
          simulator.add(ov);
          pending = [ov];
          lastFork = { state: fork.state, at: mark(), overrides: pending };
          continue;
        }

        // A condition with no value a decision can test, which the program
        // leaves open: both verdicts, at this level, the favored one first,
        // or else true.
        const first = favoredConditionalValues[conditionCount()] ?? true;
        const at = mark();
        for (const value of [first, !first]) {
          const ov: ConditionOverride = { kind: "condition", site, value };
          branches.push(nodeAt(fork.state, at, [ov], ov));
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

  // The route's own records are built only for the route found; a run that
  // did not reach the target hands on only its branches.
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
    steps: null,
    decisions: null,
    conditions: null,
    choices: null,
    overrides: [],
    forced: 0,
    beatWork: -1,
    route: newRoute(),
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
 * before the state it stands in. Its work since the last beat is what the
 * search from the top recorded at that step, one step short, as the budget
 * is: its first step charges it again.
 */
const makeResumeNode = (resumeFrom: RouteResumePoint): SearchNode => ({
  state: resumeFrom.state,
  seq: resumeFrom.steps.at(-1)?.seq ?? "",
  steps: extendTrail(null, resumeFrom.steps),
  decisions: extendTrail(null, resumeFrom.decisions),
  conditions: extendTrail(null, resumeFrom.conditions),
  choices: extendTrail(null, resumeFrom.choices),
  overrides: [],
  forced: 0,
  beatWork:
    resumeFrom.charge.beatWork < 0
      ? -1
      : Math.max(0, resumeFrom.charge.beatWork - 1),
  route: newRoute(),
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
