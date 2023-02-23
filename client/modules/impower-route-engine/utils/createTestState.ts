import { TestState } from "../types/state/testState";

export const createTestState = (): TestState => ({
  mode: "Edit",
  playback: 0,
  layout: "Page",
  paused: false,
  debug: false,
  playerVisibility: true,
  compiling: {},
});
