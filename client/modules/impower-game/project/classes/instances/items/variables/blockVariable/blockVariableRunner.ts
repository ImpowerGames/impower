import {
  BlockReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class BlockVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.BlockVariable, BlockReference>
> {}
