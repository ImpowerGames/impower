import type { CommandParams } from "../../../../logic/types/CommandParams";

export interface SpawnCommandParams extends CommandParams {
  entity: string;
}
