import { Vector2 } from "../../../../../../../impower-core";
import { VariableData, VariableTypeId } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class Vector2VariableRunner extends VariableRunner<
  VariableData<VariableTypeId.Vector2Variable, Vector2>
> {}
