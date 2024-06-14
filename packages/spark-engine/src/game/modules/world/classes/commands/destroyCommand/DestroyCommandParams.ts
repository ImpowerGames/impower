import type { CommandParams } from "../../../../../core/types/CommandParams";

export interface DestroyCommandParams extends CommandParams {
  entity: string;
}
