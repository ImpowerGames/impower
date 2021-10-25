import {
  TypeInfo,
  CommandData,
  CommandTypeId,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ExitCommandInspector extends CommandInspector<
  CommandData<CommandTypeId.ExitCommand>
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
