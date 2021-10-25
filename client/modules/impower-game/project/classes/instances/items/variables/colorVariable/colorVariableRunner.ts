import { Color } from "../../../../../../../impower-core";
import { VariableData, VariableTypeId } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class ColorVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.ColorVariable, Color>
> {}
