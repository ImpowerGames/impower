import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface WaitCommandData extends CommandData<"WaitCommand"> {
  seconds: DynamicData<number>;
}
