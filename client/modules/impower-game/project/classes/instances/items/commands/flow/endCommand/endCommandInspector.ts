import {
  TypeInfo,
  CommandData,
  CommandTypeId,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class EndCommandInspector extends CommandInspector<
  CommandData<CommandTypeId.EndCommand>
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "End",
      icon: "power-off",
      color: getProjectColor("red", 5),
      description: "Ends the game",
    };
  }
}
