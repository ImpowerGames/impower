import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class CloseCommandInspector extends CommandInspector<
  CommandData<"CloseCommand">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "}",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Closes a conditional group",
    };
  }
}
