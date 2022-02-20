import { CommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class ElseCommandInspector extends CommandInspector<
  CommandData<"ElseCommand">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "} Else",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description:
        "Executes child commands if the previous 'If' or 'Else If' conditions were false",
    };
  }

  getSummary(_data: CommandData): string {
    return `{`;
  }
}
