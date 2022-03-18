import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class RepeatCommandInspector extends CommandInspector<
  CommandData<"RepeatCommand">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Repeat",
      icon: "sign-in",
      color: getProjectColor("red", 5),
      description: "Repeats this block",
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: CommandData<"RepeatCommand">
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
