import type { CommandData } from "../../../../logic/types/CommandData";
import type { SpawnCommandParams } from "./SpawnCommandParams";

export interface SpawnCommandData
  extends CommandData<"SpawnCommand", SpawnCommandParams> {}
