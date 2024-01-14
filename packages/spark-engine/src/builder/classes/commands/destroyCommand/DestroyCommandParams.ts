import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface DestroyCommandParams extends CommandParams {
  entity: string;
}
