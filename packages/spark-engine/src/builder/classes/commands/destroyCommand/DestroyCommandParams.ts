import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface DestroyCommandParams extends CommandParams {
  entity: string;
}
