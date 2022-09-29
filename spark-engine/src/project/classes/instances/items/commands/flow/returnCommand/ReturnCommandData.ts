import { CommandData } from "../../../command/CommandData";

export interface ReturnCommandData extends CommandData<"ReturnCommand"> {
  value: string;
}
