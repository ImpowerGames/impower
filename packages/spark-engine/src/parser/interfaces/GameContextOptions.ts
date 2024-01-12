import { Game, GameConfig, GameState } from "../../game";
import { GameRunner } from "../../runner/classes/GameRunner";

export interface GameContextOptions<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState,
  R extends GameRunner<G> = GameRunner<G>
> {
  simulateFromProgram?: number;
  simulateFromLine?: number;
  startFromProgram?: number;
  startFromLine?: number;
  config?: C;
  state?: S;
  defaults?: Record<string, Record<string, object>>;
  createGame?: (config?: C, state?: S) => G;
  createRunner?: (game: G) => R;
}
