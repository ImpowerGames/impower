import { GameConfig, GameModules } from "../../game/core/classes/Game";

export interface GameBuilderOptions<
  C extends GameConfig = GameConfig,
  M extends GameModules = GameModules
> {
  simulation?: {
    waypoints?: { program: number; line: number }[];
    startpoint?: { program: number; line: number };
  };
  config?: C;
  modules?: M;
  preview?: boolean;
}
