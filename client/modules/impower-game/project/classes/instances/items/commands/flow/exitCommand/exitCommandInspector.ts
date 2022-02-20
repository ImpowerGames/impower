import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class ExitCommandInspector extends CommandInspector<
  CommandData<"ExitCommand">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Exit",
      icon: "sign-out",
      color: getProjectColor("red", 5),
      description: "Exits the parent block",
    };
  }
}
