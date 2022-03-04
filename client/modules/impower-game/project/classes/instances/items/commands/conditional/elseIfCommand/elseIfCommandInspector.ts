import { TypeInfo } from "../../../../../../../data";
import { IfCommandInspector } from "../ifCommand/ifCommandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ElseIfCommandInspector extends IfCommandInspector {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "} Else If",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description:
        "Executes child commands if the conditions are true and the previous 'If' conditions were false",
    };
  }
}
