import {
  ConstructReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class ConstructVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.ConstructVariable, ConstructReference>
> {}
