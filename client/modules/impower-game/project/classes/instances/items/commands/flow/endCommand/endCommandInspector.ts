import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class EndCommandInspector extends CommandInspector<
  CommandData<"EndCommand">
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
