import { CommandParams } from "../../../command/CommandParams";

export interface SpawnCommandParams extends CommandParams {
  entity: string;
}
