import type { CommandParams } from "../../../../logic/types/CommandParams";

export interface DestroyCommandParams extends CommandParams {
  entity: string;
}
