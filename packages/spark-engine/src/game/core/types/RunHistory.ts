import type { HistoryReason } from "../constants/HISTORY_REASONS";
import type { DocumentLocation } from "./DocumentLocation";

export type RollTarget = "beat" | "choice";

export interface GameHistory {
  canRollBack: boolean;
  canRollForward: boolean;
  behindLatest: boolean;
  canStepOut: boolean;
  rollBackRefusal: HistoryReason | null;
  rollForwardRefusal: HistoryReason | null;
  stepRefusal: HistoryReason | null;
  stepOutRefusal: HistoryReason | null;
}

export interface SettledLoop {
  channel: string;
  key: string;
  play: "continue" | "start";
}

export interface StoppedLoop {
  channel: string;
  key: string;
}

export interface SettledBeat {
  beat: number;
  location: DocumentLocation | null;
  choices: string[];
  chosen: number | null;
  textRevealed: true;
  transitionsEnded: true;
  oneShotsSilent: true;
  timersRestarted: true;
  loops: SettledLoop[];
  stoppedLoops: StoppedLoop[];
}

export type RollResult =
  | { moved: true; restored: SettledBeat; history: GameHistory }
  | { moved: false; reason: HistoryReason; history: GameHistory }
  | { moved: false; superseded: true; history: GameHistory };
