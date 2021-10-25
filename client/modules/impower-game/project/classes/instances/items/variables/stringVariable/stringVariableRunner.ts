import { VariableData, VariableTypeId } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class StringVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.StringVariable, string>
> {}
