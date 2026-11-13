import type { GameState } from "@impower/spark-editor-protocol/src/types";

export const LAUNCH_PHASES = [
  "idle",
  "awaiting",
  "starting",
  "running",
  "paused",
  "ended",
] as const;

export type LaunchPhase = (typeof LAUNCH_PHASES)[number];

export const LAUNCH_EVENTS = [
  "press",
  "stop",
  "connected",
  "lost",
  "answered",
  "refused",
  "reported",
  "limit",
  "ended",
  "exited",
] as const;

export type LaunchEvent = (typeof LAUNCH_EVENTS)[number];

export type LaunchEffect =
  | "armLimit"
  | "clearLimit"
  | "sendStart"
  | "forgetStart"
  | "sendStop"
  | "startDebug"
  | "endDebug"
  | "clearStatuses"
  | "sayLimit"
  | "markEnded";

export interface LaunchStep {
  to: LaunchPhase;
  effects: readonly LaunchEffect[];
}

export interface LaunchContext {
  connected: boolean;
  refused: boolean;
}

type LaunchCell = LaunchStep | ((context: LaunchContext) => LaunchStep | null);

const step = (to: LaunchPhase, ...effects: LaunchEffect[]): LaunchStep => ({
  to,
  effects,
});

const cancelStart = step("idle", "clearLimit", "forgetStart", "sendStop", "endDebug");

const stopRun = step("idle", "sendStop", "endDebug");

const loseRun = step("idle", "clearStatuses", "endDebug");

const exitRun = step("idle", "endDebug");

const live: Partial<Record<LaunchEvent, LaunchCell>> = {
  press: stopRun,
  stop: stopRun,
  lost: loseRun,
  exited: exitRun,
};

export const LAUNCH_TABLE: Record<
  LaunchPhase,
  Partial<Record<LaunchEvent, LaunchCell>>
> = {
  idle: {
    press: ({ connected, refused }) =>
      refused
        ? null
        : connected
          ? step("starting", "armLimit", "sendStart", "startDebug")
          : step("awaiting", "armLimit"),
    reported: step("running", "sendStart", "startDebug"),
    lost: step("idle", "clearStatuses"),
  },
  awaiting: {
    press: step("idle", "clearLimit"),
    stop: step("idle", "clearLimit"),
    connected: step("starting", "sendStart", "startDebug"),
    lost: step("awaiting", "clearStatuses"),
    limit: step("idle", "sayLimit"),
  },
  starting: {
    press: cancelStart,
    stop: cancelStart,
    lost: step("awaiting", "forgetStart", "clearStatuses", "endDebug"),
    answered: step("running", "clearLimit"),
    reported: step("running", "clearLimit"),
    refused: step("idle", "clearLimit", "endDebug"),
    limit: step("idle", "forgetStart", "sendStop", "endDebug", "sayLimit"),
    ended: step("starting", "markEnded"),
    exited: step("idle", "clearLimit", "forgetStart", "endDebug"),
  },
  running: { ...live, ended: step("ended", "markEnded") },
  paused: { ...live, ended: step("ended", "markEnded") },
  ended: { ...live, ended: step("ended", "markEnded") },
};

export const launchStep = (
  from: LaunchPhase,
  event: LaunchEvent,
  context: LaunchContext,
): LaunchStep | null => {
  const cell = LAUNCH_TABLE[from][event];
  return typeof cell === "function" ? cell(context) : (cell ?? null);
};

export const launchPhaseOf = (
  game: GameState,
  requested: boolean,
): LaunchPhase =>
  game.running
    ? game.ended
      ? "ended"
      : game.paused
        ? "paused"
        : "running"
    : game.starting
      ? requested
        ? "starting"
        : "awaiting"
      : "idle";

const settled = {
  loading: false,
  running: false,
  starting: false,
  ended: false,
  choosing: false,
  picks: {},
};

const pending = {
  loading: false,
  starting: true,
  paused: false,
  ended: false,
  choosing: false,
  picks: {},
};

export const launchGameState = (
  game: GameState,
  from: LaunchPhase,
  { to, effects }: LaunchStep,
): GameState => {
  const next =
    to === "idle"
      ? from === "idle"
        ? game
        : { ...game, ...settled }
      : to === "awaiting" || to === "starting"
        ? from === "idle"
          ? { ...game, ...pending }
          : game
        : to === "running" && (from === "awaiting" || from === "starting")
          ? { ...game, loading: false, starting: false, running: true }
          : to === "running" && from === "idle"
            ? {
                ...game,
                loading: false,
                starting: false,
                running: true,
                paused: false,
                picks: {},
              }
            : game;
  return effects.includes("markEnded")
    ? { ...next, ended: true, loading: false }
    : next;
};
