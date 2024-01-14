import { CommandData } from "../../../../game/logic/types/CommandData";
import { SpawnCommandParams } from "./SpawnCommandParams";

export interface SpawnCommandData
  extends CommandData<"SpawnCommand", SpawnCommandParams> {}
