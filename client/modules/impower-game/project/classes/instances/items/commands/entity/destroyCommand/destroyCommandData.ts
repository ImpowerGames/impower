import { CommandData } from "../../../command/commandData";

export interface DestroyCommandData extends CommandData<"DestroyCommand"> {
  entity: string;
}
