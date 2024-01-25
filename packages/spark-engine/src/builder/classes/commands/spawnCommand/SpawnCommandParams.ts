import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface SpawnCommandParams extends CommandParams {
  entity: string;
}
