import { SparkParseResult } from "../../../../sparkdown";
import { SparkGame, SparkGameConfig, SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner";
import { STRUCT_DEFAULTS } from "../constants/STRUCT_DEFAULTS";
import { SparkContextConfig } from "../interfaces/SparkContextConfig";
import { Context } from "./Context";

export class SparkContext<
  G extends SparkGame = SparkGame,
  C extends SparkGameConfig = SparkGameConfig,
  S extends SparkGameState = SparkGameState,
  R extends SparkGameRunner<G> = SparkGameRunner<G>
> extends Context<G, C, S, R> {
  constructor(
    parsed: SparkParseResult,
    config?: SparkContextConfig<G, C, S, R>
  ) {
    super(parsed, {
      defaults: STRUCT_DEFAULTS,
      runner: new SparkGameRunner<G>() as R,
      createGame: (c?: C, s?: S) => new SparkGame(c, s) as G,
      ...(config || {}),
    });
  }
}
