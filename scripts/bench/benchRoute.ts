// What the engine measurements share: a story standing at the top of the route
// to a line, with the route's decisions forced, driven as the route planner
// drives it.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { buildRouteSimulator, type RoutePlan } from "../../packages/sparkdown/src/compiler/utils/planRoute";
import type { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles } from "./benchProject";

const NOOP = () => {};

export interface Walk {
  game: Game;
  story: Story;
  route: RoutePlan;
  toPath: string;
}

// `hooked` leaves onExecute a function that does nothing, which is what a story
// with any execution hook pays; otherwise it is cleared, as the planner clears it.
export function prepareWalk(project: string, line: number, hooked = false): Walk {
  const files = loadProjectFiles(project);
  const startFrom = { file: MAIN_URI, line: line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, files, startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  // The engine as the page holds it: constructed from the compiled program.
  const game = new Game({ program: cold.program, ...benchSystem } as any);
  game.setStartFrom(startFrom);
  const toPath = game.startPath;
  if (!toPath) throw new Error(`line ${line} of main.sd maps to no story path`);
  const story = game.story as Story;
  const route = Game.planRoute(story, game.program, Game.getSimulateFromPath(toPath), toPath);
  if (!route) throw new Error(`no route to ${toPath}`);
  // The game's observers are bookkeeping of its own, as are the planner's.
  story.onError = NOOP as any;
  story.onExecute = hooked ? (NOOP as any) : null;
  story.onMakeChoice = NOOP as any;
  story.onEvaluateCondition = NOOP as any;
  story.onSaveStateSnapshot = NOOP as any;
  story.onRestoreStateSnapshot = NOOP as any;
  story.onDiscardStateSnapshot = NOOP as any;
  story.onDidContinue = null;
  return { game, story, route, toPath };
}

// Puts the story at the top of the route with the route's decisions forced,
// which is where the planner's search starts and what makes a replay follow it.
export function rewindWalk({ story, route }: Walk) {
  story.CancelAsyncContinue();
  story.ResetState();
  story.ChoosePathString(route.fromPath);
  story.simulator = buildRouteSimulator(route.decisions);
  story.pauseBeforeEvaluatingConditions = false;
}
