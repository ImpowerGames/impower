import type { StoryEnding } from "@impower/sparkdown/src/program/ProgramStory";

export const endingStatusText = (ending: StoryEnding): string =>
  ending === "fin"
    ? "End of story"
    : ending === "error"
      ? "Stopped by an error"
      : "Story ran out";
