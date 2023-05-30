import { CommandData } from "../../../command/CommandData";

export interface SpawnCommandData extends CommandData<"SpawnCommand"> {
  entity: string;
}
