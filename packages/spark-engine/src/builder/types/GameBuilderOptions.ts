import { GameModules } from "../../game/core/classes/Game";

export interface GameBuilderOptions<M extends GameModules = GameModules> {
  simulation?: {
    waypoints?: { file?: string; line: number }[];
    startpoint?: { file?: string; line: number };
  };
  modules?: M;
  previewing?: boolean;
}
