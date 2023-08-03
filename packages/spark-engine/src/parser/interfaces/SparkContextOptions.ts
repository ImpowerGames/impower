import { SparkGame, SparkGameConfig, SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner";
import { ContextOptions } from "./ContextOptions";

export interface SparkContextOptions<
  G extends SparkGame = SparkGame,
  C extends SparkGameConfig = SparkGameConfig,
  S extends SparkGameState = SparkGameState,
  R extends SparkGameRunner<G> = SparkGameRunner<G>
> extends ContextOptions<G, C, S, R> {}
