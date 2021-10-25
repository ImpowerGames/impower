import { VariableData, VariableTypeId } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class BooleanVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.BooleanVariable, boolean>
> {}
