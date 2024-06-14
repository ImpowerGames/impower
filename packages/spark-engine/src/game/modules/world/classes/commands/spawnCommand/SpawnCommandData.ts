import type { CommandData } from "../../../../../core/types/CommandData";
import type { SpawnCommandParams } from "./SpawnCommandParams";

export interface SpawnCommandData
  extends CommandData<"SpawnCommand", SpawnCommandParams> {}
