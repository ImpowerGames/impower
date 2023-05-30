import { SparkGame, SparkGameConfig, SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner";
import { ContextConfig } from "./ContextConfig";

export interface SparkContextConfig<
  G extends SparkGame = SparkGame,
  C extends SparkGameConfig = SparkGameConfig,
  S extends SparkGameState = SparkGameState,
  R extends SparkGameRunner<G> = SparkGameRunner<G>
> extends ContextConfig<G, C, S, R> {}
