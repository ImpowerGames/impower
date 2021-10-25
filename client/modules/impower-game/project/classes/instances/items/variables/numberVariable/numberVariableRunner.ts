import { VariableData, VariableTypeId } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class NumberVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.NumberVariable, number>
> {}
