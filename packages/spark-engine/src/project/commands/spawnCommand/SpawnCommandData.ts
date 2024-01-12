import { CommandData } from "../../command/CommandData";
import { SpawnCommandParams } from "./SpawnCommandParams";

export interface SpawnCommandData
  extends CommandData<"SpawnCommand", SpawnCommandParams> {}
