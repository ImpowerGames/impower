import { CommandData } from "../../../command/commandData";

export interface ReturnCommandData extends CommandData<"ReturnCommand"> {
  value: string;
  returnToTop: boolean;
}
