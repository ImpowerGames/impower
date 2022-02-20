import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class EnterCommandInspector extends CommandInspector<
  CommandData<"EnterCommand">
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
    data: CommandData<"EnterCommand">
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
