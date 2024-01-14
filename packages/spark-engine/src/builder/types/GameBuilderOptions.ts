import { Game, GameConfig, GameState } from "../../game/core/classes/Game";
import { GameContext } from "../../game/core/types/GameContext";

export interface GameBuilderOptions<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState
> {
  simulation?: {
    simulateFromProgram?: number;
    simulateFromLine?: number;
    startFromProgram?: number;
    startFromLine?: number;
  };
  config?: C;
  state?: S;
  defaults?: Record<string, Record<string, object>>;
  createGame?: (context?: GameContext, config?: C, state?: S) => G;
}
