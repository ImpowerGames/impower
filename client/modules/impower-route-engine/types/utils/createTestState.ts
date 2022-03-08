import { TestState } from "../state/testState";

export const createTestState = (): TestState => ({
  mode: "Edit",
  control: "Play",
  playback: "Default",
  layout: "Page",
  debug: false,
  startTime: 0,
  playerVisibility: true,
});
