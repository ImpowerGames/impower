import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface SpawnCommandParams extends CommandParams {
  entity: string;
}
