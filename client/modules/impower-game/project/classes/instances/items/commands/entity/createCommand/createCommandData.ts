import { CommandData } from "../../../command/commandData";

export interface CreateCommandData extends CommandData<"CreateCommand"> {
  entity: string;
}
