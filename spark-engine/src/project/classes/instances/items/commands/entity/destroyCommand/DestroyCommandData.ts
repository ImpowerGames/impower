import { CommandData } from "../../../command/CommandData";

export interface DestroyCommandData extends CommandData<"DestroyCommand"> {
  entity: string;
}
