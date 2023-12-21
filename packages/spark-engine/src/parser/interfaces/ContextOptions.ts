import { Game, GameConfig, GameState } from "../../game";
import { GameRunner } from "../../runner/classes/GameRunner";

export interface ContextOptions<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState,
  R extends GameRunner<G> = GameRunner<G>
> {
  simulateFromProgram?: string;
  simulateFromLine?: number;
  startFromProgram?: string;
  startFromLine?: number;
  editable?: boolean;
  config?: C;
  state?: S;
  defaults?: Record<string, Record<string, object>>;
  runner?: R;
  createGame?: (config?: C, state?: S) => G;
}
