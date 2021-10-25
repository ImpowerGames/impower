import {
  TypeInfo,
  CommandData,
  CommandTypeId,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class EnterCommandInspector extends CommandInspector<
  CommandData<CommandTypeId.EnterCommand>
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Enter",
      icon: "sign-in",
      color: getProjectColor("red", 5),
      description: "Enters this block",
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: CommandData<CommandTypeId.EnterCommand>
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
