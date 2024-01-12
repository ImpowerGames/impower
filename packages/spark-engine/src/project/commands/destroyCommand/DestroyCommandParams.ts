import { CommandParams } from "../../command/CommandParams";

export interface DestroyCommandParams extends CommandParams {
  entity: string;
}
