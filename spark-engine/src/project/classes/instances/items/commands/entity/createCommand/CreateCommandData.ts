import { CommandData } from "../../../command/CommandData";

export interface CreateCommandData extends CommandData<"CreateCommand"> {
  entity: string;
}
