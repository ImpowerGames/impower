import type { CommandParams } from "../../../../../core/types/CommandParams";

export interface SpawnCommandParams extends CommandParams {
  entity: string;
}
