import type { StoryEnding } from "@impower/sparkdown/src/program/ProgramStory";
import type { DocumentLocation } from "./DocumentLocation";

export type GameEndingKind = StoryEnding;

export interface GameEnding {
  kind: GameEndingKind;
  location: DocumentLocation | null;
  error?: {
    message: string;
    location: DocumentLocation;
  };
}
