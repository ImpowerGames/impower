import {
  CommandData,
  CommandTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class CloseCommandInspector extends CommandInspector<
  CommandData<CommandTypeId.CloseCommand>
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
