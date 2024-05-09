import type { Game } from "../../core/classes/Game";
import { DisplayCommandRunner } from "./classes/commands/displayCommand/DisplayCommandRunner";

export const writerCommands = (game: Game) => ({
  DisplayCommand: new DisplayCommandRunner(game),
});
