import { SparkProgram } from "../../../../sparkdown/src";
import { SparkGame, SparkGameConfig, SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner/classes/SparkGameRunner";
import { SparkContextOptions } from "../interfaces/SparkContextOptions";
import { Context } from "./Context";

export default class SparkContext<
  G extends SparkGame = SparkGame,
  C extends SparkGameConfig = SparkGameConfig,
  S extends SparkGameState = SparkGameState,
  R extends SparkGameRunner<G> = SparkGameRunner<G>
> extends Context<G, C, S, R> {
  constructor(
    programs: Record<string, SparkProgram>,
    options?: SparkContextOptions<G, C, S, R>
  ) {
    super(programs, {
      createGame: (c?: C, s?: S) => new SparkGame(c, s) as G,
      createRunner: (g: G) => new SparkGameRunner<G>(g) as R,
      ...(options || {}),
    });
  }
}
