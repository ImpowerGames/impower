export const HISTORY_REASONS = {
  rollBack: "Nothing to go back to.",
  choiceGone: "That choice is no longer in this run.",
  rollForward: "No later played beat. Continue the story to play more.",
  step: "Make the choice, or skip to the latest beat, to step on.",
  stepOut: "Nothing is calling, so there is nothing to step out of.",
} as const;

export type HistoryReason =
  (typeof HISTORY_REASONS)[keyof typeof HISTORY_REASONS];
