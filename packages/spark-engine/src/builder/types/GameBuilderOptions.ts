import { Game, GameConfig, GameState } from "../../game/core/classes/Game";

export interface GameBuilderOptions<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState
> {
  simulateFromProgram?: number;
  simulateFromLine?: number;
  startFromProgram?: number;
  startFromLine?: number;
  config?: C;
  state?: S;
  defaults?: Record<string, Record<string, object>>;
  createGame?: (config?: C, state?: S) => G;
}
